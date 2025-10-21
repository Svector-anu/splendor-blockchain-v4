// Copyright 2015 The go-ethereum Authors
// This file is part of the go-ethereum library.
//
// The go-ethereum library is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// The go-ethereum library is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with the go-ethereum library. If not, see <http://www.gnu.org/licenses/>.
// bug across the project fixed by Titan <https://splendor.org/>

package core

import (
    "fmt"
    "math/big"
    "sync"

    "github.com/ethereum/go-ethereum/accounts"
    "github.com/ethereum/go-ethereum/common"
    "github.com/ethereum/go-ethereum/common/gopool"
    "github.com/ethereum/go-ethereum/consensus"
    "github.com/ethereum/go-ethereum/core/state"
    "github.com/ethereum/go-ethereum/core/types"
    "github.com/ethereum/go-ethereum/core/vm"
    "github.com/ethereum/go-ethereum/crypto"
    "github.com/ethereum/go-ethereum/log"
    "github.com/ethereum/go-ethereum/params"
    "github.com/ethereum/go-ethereum/rlp"
)

// StateProcessor is a basic Processor, which takes care of transitioning
// state from one point to another.
//
// StateProcessor implements Processor.
type StateProcessor struct {
	config *params.ChainConfig // Chain configuration options
	bc     *BlockChain         // Canonical block chain
	engine consensus.Engine    // Consensus engine used for block rewards
}

// NewStateProcessor initialises a new StateProcessor.
func NewStateProcessor(config *params.ChainConfig, bc *BlockChain, engine consensus.Engine) *StateProcessor {
	return &StateProcessor{
		config: config,
		bc:     bc,
		engine: engine,
	}
}

type ProcessOption struct {
	bloomWg *sync.WaitGroup
}

type ModifyProcessOptionFunc func(opt *ProcessOption)

func CreatingBloomParallel(wg *sync.WaitGroup) ModifyProcessOptionFunc {
	return func(opt *ProcessOption) {
		opt.bloomWg = wg
	}
}

// Process processes the state changes according to the Ethereum rules by running
// the transaction messages using the statedb and applying any rewards to both
// the processor (coinbase) and any included uncles.
//
// Process returns the receipts and logs accumulated during the process and
// returns the amount of gas that was used in the process. If any of the
// transactions failed to execute due to insufficient gas it will return an error.
func (p *StateProcessor) Process(block *types.Block, statedb *state.StateDB, cfg vm.Config) (types.Receipts, []*types.Log, uint64, error) {
	var (
		receipts    = make([]*types.Receipt, 0)
		usedGas     = new(uint64)
		header      = block.Header()
		blockHash   = block.Hash()
		blockNumber = block.Number()
		allLogs     []*types.Log
		gp          = new(GasPool).AddGas(block.GasLimit())
	)

	blockContext := NewEVMBlockContext(header, p.bc, nil)
	vmenv := vm.NewEVM(blockContext, vm.TxContext{}, statedb, p.config, cfg)
	// Iterate over and process the individual transactions
	posa, isPoSA := p.engine.(consensus.PoSA)
	if isPoSA {
		if err := posa.PreHandle(p.bc, header, statedb); err != nil {
			return nil, nil, 0, err
		}

		vmenv.Context.ExtraValidator = posa.CreateEvmExtraValidator(header, statedb)
	}

	// preload from and to of txs
	signer := types.MakeSigner(p.config, header.Number)
	statedb.PreloadAccounts(block, signer)

	var bloomWg sync.WaitGroup
	returnErrBeforeWaitGroup := true
	defer func() {
		if returnErrBeforeWaitGroup {
			bloomWg.Wait()
		}
	}()

    commonTxs := make([]*types.Transaction, 0, len(block.Transactions()))
    systemTxs := make([]*types.Transaction, 0)
    for i, tx := range block.Transactions() {
        // Handle native X402 typed transactions as gasless system settlements
        if tx.Type() == types.X402TxType {
            // Decode the embedded x402 payload
            type x402Permit struct {
                Value    *big.Int
                Deadline *big.Int
                V        uint8
                R        []byte
                S        []byte
            }
            type x402Payload struct {
                From        common.Address
                To          common.Address
                Value       *big.Int
                ValidAfter  uint64
                ValidBefore uint64
                Nonce       common.Hash
                Asset       common.Address
                Signature   []byte
                Permit      *x402Permit
            }
            var payload x402Payload
            if err := rlp.DecodeBytes(tx.Data(), &payload); err != nil {
                return nil, nil, 0, fmt.Errorf("x402: invalid payload for tx %s: %w", tx.Hash(), err)
            }
            // Prepare state for log capture under this tx index
            statedb.Prepare(tx.Hash(), i)

            // Best-effort time validity check against header timestamp
            ts := header.Time
            valid := !(ts < payload.ValidAfter || ts > payload.ValidBefore)

            // Strict signature verification (EIP-191 prefix, v2 message with chainId and asset)
            // Message format: x402-payment:from:to:valueHex:validAfter:validBefore:nonceHex:assetHex:chainId
            // valueHex uses 0x-prefixed hex string
            chainID := p.config.ChainID.Uint64()
            valHex := "0x" + payload.Value.Text(16)
            msg := fmt.Sprintf("x402-payment:%s:%s:%s:%d:%d:%s:%s:%d",
                payload.From.Hex(), payload.To.Hex(), valHex, payload.ValidAfter, payload.ValidBefore, payload.Nonce.Hex(), payload.Asset.Hex(), chainID,
            )
            sig := append([]byte(nil), payload.Signature...)
            sigOK := false
            if len(sig) == 65 {
                if sig[64] >= 27 {
                    sig[64] -= 27
                }
                h := accounts.TextHash([]byte(msg))
                if pub, err := crypto.SigToPub(h, sig); err == nil {
                    addr := crypto.PubkeyToAddress(*pub)
                    sigOK = (addr == payload.From)
                }
            }
            // Nonce replay protection: mark (from, nonce) as used
            // Use a fixed pseudo-address in state to store replay markers
            x402Registry := common.HexToAddress("0x0000000000000000000000000000000000000403")
            key := crypto.Keccak256Hash(append(payload.From.Bytes(), payload.Nonce.Bytes()...))
            already := statedb.GetState(x402Registry, key)
            unused := (already == (common.Hash{}))

            success := false
            // Use a fresh EVM instance per x402 settlement to avoid leaking
            // interpreter state from earlier EVM executions (which was
            // triggering stack underflow errors when the shared instance was
            // reused after running regular transactions).
            evm := vm.NewEVM(blockContext, vm.TxContext{}, statedb, p.config, cfg)
            if isPoSA {
                evm.Context.ExtraValidator = posa.CreateEvmExtraValidator(header, statedb)
            }
            if valid && sigOK && unused {
                if payload.Asset == (common.Address{}) {
                    // Native SPLD transfer: move balance directly
                    if statedb.GetBalance(payload.From).Cmp(payload.Value) >= 0 {
                        statedb.SubBalance(payload.From, payload.Value)
                        statedb.AddBalance(payload.To, payload.Value)
                        success = true
                    } else {
                        success = false
                    }
                } else {
                    // ERC-20: optionally apply permit first, then transferFrom(from, to, amount)
                    if payload.Permit != nil {
                        // Build permit calldata
                        sel := crypto.Keccak256([]byte("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"))[:4]
                        var d []byte
                        d = append(d, sel...)
                        d = append(d, common.LeftPadBytes(payload.From.Bytes(), 32)...)
                        d = append(d, common.LeftPadBytes(payload.To.Bytes(), 32)...)
                        val := payload.Permit.Value; if val == nil { val = new(big.Int) }
                        dl := payload.Permit.Deadline; if dl == nil { dl = new(big.Int).SetUint64(^uint64(0)) }
                        d = append(d, common.LeftPadBytes(val.Bytes(), 32)...)
                        d = append(d, common.LeftPadBytes(dl.Bytes(), 32)...)
                        d = append(d, common.LeftPadBytes([]byte{byte(payload.Permit.V)}, 32)...)
                        r := payload.Permit.R; if len(r) != 32 { r = common.LeftPadBytes(r, 32) }
                        s := payload.Permit.S; if len(s) != 32 { s = common.LeftPadBytes(s, 32) }
                        d = append(d, r...)
                        d = append(d, s...)
                        // Call token.permit from spender context (anyone can call, but keep origin consistent)
                        old := evm.TxContext
                        evm.TxContext = vm.TxContext{Origin: payload.To, GasPrice: new(big.Int)}
                        _, _, perr := evm.Call(vm.AccountRef(payload.To), payload.Asset, d, header.GasLimit, new(big.Int))
                        evm.TxContext = old
                        if perr != nil {
                            success = false
                        }
                    }
                    // ERC-20 transferFrom(from, to, amount) called by spender = To
                    // Build calldata
                    methodID := crypto.Keccak256([]byte("transferFrom(address,address,uint256)"))[:4]
                    var data []byte
                    data = append(data, methodID...)
                    data = append(data, common.LeftPadBytes(payload.From.Bytes(), 32)...)
                    data = append(data, common.LeftPadBytes(payload.To.Bytes(), 32)...)
                    data = append(data, common.LeftPadBytes(payload.Value.Bytes(), 32)...)

                    // Set tx context origin as spender (recipient)
                    oldCtx := evm.TxContext
                    evm.TxContext = vm.TxContext{Origin: payload.To, GasPrice: new(big.Int)}
                    // Call token
                    ret, _, vmerr := evm.Call(vm.AccountRef(payload.To), payload.Asset, data, header.GasLimit, new(big.Int))
                    // Restore context
                    evm.TxContext = oldCtx
                    if vmerr == nil {
                        if len(ret) == 0 {
                            // Non-standard tokens: no return data implies success
                            success = true
                        } else if len(ret) >= 32 {
                            // Standard ERC-20: boolean success in 32 bytes
                            // Treat nonzero as success
                            b := new(big.Int).SetBytes(ret)
                            success = b.Sign() != 0
                        } else {
                            success = false
                        }
                    }
                }
                // Mark nonce used on success only
                if success {
                    statedb.SetState(x402Registry, key, common.BytesToHash([]byte{1}))
                }
            }

            // Update state with pending changes the same way as EVM txs
            var root []byte
            if p.config.IsByzantium(blockNumber) {
                statedb.Finalise(true)
            } else {
                root = statedb.IntermediateRoot(p.config.IsEIP158(blockNumber)).Bytes()
            }

            // Build receipt (gasless)
            receipt := &types.Receipt{Type: types.X402TxType, PostState: root, CumulativeGasUsed: *usedGas}
            if success {
                receipt.Status = types.ReceiptStatusSuccessful
            } else {
                receipt.Status = types.ReceiptStatusFailed
            }
            receipt.TxHash = tx.Hash()
            receipt.GasUsed = 0
            receipt.Logs = statedb.GetLogs(tx.Hash(), blockHash)
            receipt.BlockHash = blockHash
            receipt.BlockNumber = blockNumber
            receipt.TransactionIndex = uint(statedb.TxIndex())
            // Bloom in parallel
            bloomWg.Add(1)
            gopool.Submit(func() {
                receipt.Bloom = types.CreateBloom(types.Receipts{receipt})
                bloomWg.Done()
            })

            receipts = append(receipts, receipt)
            allLogs = append(allLogs, receipt.Logs...)
            // DO NOT add x402 transactions to commonTxs - they are gasless and should not be included in block reward calculations
            continue
        }
        if isPoSA {
            sender, err := types.Sender(signer, tx)
            if err != nil {
                return nil, nil, 0, err
            }
			ok, err := posa.IsSysTransaction(sender, tx, header)
			if err != nil {
				return nil, nil, 0, err
			}
			if ok {
				systemTxs = append(systemTxs, tx)
				continue
			}
			err = posa.ValidateTx(sender, tx, header, statedb)
			if err != nil {
				return nil, nil, 0, err
			}
		}
		msg, err := tx.AsMessage(signer, header.BaseFee)
		if err != nil {
			return nil, nil, 0, fmt.Errorf("could not apply tx %d [%v]: %w", i, tx.Hash().Hex(), err)
		}
		statedb.Prepare(tx.Hash(), i)
		receipt, err := applyTransaction(msg, p.config, p.bc, nil, gp, statedb, blockNumber, blockHash, tx, usedGas, vmenv, CreatingBloomParallel(&bloomWg))
		if err != nil {
			return nil, nil, 0, fmt.Errorf("could not apply tx %d [%v]: %w", i, tx.Hash().Hex(), err)
		}
		receipts = append(receipts, receipt)
		allLogs = append(allLogs, receipt.Logs...)
		commonTxs = append(commonTxs, tx)
	}
	bloomWg.Wait()
	returnErrBeforeWaitGroup = false

	// Finalize the block, applying any consensus engine specific extras (e.g. block rewards)
	if err := p.engine.Finalize(p.bc, header, statedb, &commonTxs, block.Uncles(), &receipts, systemTxs); err != nil {
		return nil, nil, 0, err
	}

	return receipts, allLogs, *usedGas, nil
}

func applyTransaction(msg types.Message, config *params.ChainConfig, bc ChainContext, author *common.Address, gp *GasPool, statedb *state.StateDB, blockNumber *big.Int, blockHash common.Hash, tx *types.Transaction, usedGas *uint64, evm *vm.EVM, modOptions ...ModifyProcessOptionFunc) (*types.Receipt, error) {
	// Create a new context to be used in the EVM environment.
	txContext := NewEVMTxContext(msg)
	evm.Reset(txContext, statedb)

	// Apply the transaction to the current state (included in the env).
	result, err := ApplyMessage(evm, msg, gp)
	if err != nil {
		return nil, err
	}

	// Update the state with pending changes.
	var root []byte
	if config.IsByzantium(blockNumber) {
		statedb.Finalise(true)
	} else {
		root = statedb.IntermediateRoot(config.IsEIP158(blockNumber)).Bytes()
	}
	*usedGas += result.UsedGas

	// Create a new receipt for the transaction, storing the intermediate root and gas used
	// by the tx.
	receipt := &types.Receipt{Type: tx.Type(), PostState: root, CumulativeGasUsed: *usedGas}
	if result.Failed() {
		receipt.Status = types.ReceiptStatusFailed
	} else {
		receipt.Status = types.ReceiptStatusSuccessful
	}
	receipt.TxHash = tx.Hash()
	receipt.GasUsed = result.UsedGas

	// If the transaction created a contract, store the creation address in the receipt.
	if msg.To() == nil {
		receipt.ContractAddress = crypto.CreateAddress(evm.TxContext.Origin, tx.Nonce())
	}

	// Set the receipt logs and create the bloom filter.
	receipt.Logs = statedb.GetLogs(tx.Hash(), blockHash)
	receipt.BlockHash = blockHash
	receipt.BlockNumber = blockNumber
	receipt.TransactionIndex = uint(statedb.TxIndex())

	var processOp ProcessOption
	for _, fun := range modOptions {
		fun(&processOp)
	}
	if processOp.bloomWg == nil {
		receipt.Bloom = types.CreateBloom(types.Receipts{receipt})
	} else {
		processOp.bloomWg.Add(1)
		gopool.Submit(func() {
			receipt.Bloom = types.CreateBloom(types.Receipts{receipt})
			processOp.bloomWg.Done()
		})
	}

	if result.Failed() {
		log.Debug("apply transaction with evm error", "txHash", tx.Hash().String(), "vmErr", result.Err)
	}

	return receipt, err
}

// ApplyTransaction attempts to apply a transaction to the given state database
// and uses the input parameters for its environment. It returns the receipt
// for the transaction, gas used and an error if the transaction failed,
// indicating the block was invalid.
func ApplyTransaction(config *params.ChainConfig, bc ChainContext, author *common.Address, gp *GasPool, statedb *state.StateDB, header *types.Header, tx *types.Transaction, usedGas *uint64, cfg vm.Config, extraValidator types.EvmExtraValidator) (*types.Receipt, error) {
	msg, err := tx.AsMessage(types.MakeSigner(config, header.Number), header.BaseFee)
	if err != nil {
		return nil, err
	}
	// Create a new context to be used in the EVM environment
	blockContext := NewEVMBlockContext(header, bc, author)
	blockContext.ExtraValidator = extraValidator
	vmenv := vm.NewEVM(blockContext, vm.TxContext{}, statedb, config, cfg)
	return applyTransaction(msg, config, bc, author, gp, statedb, header.Number, header.Hash(), tx, usedGas, vmenv)
}
