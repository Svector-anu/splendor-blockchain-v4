// Copyright 2024 Splendor Blockchain
// Native x402 payments protocol implementation

package eth

import (
    "context"
    "fmt"
    "math/big"
    "time"
    "sync"
    "os"
    "encoding/binary"

    "github.com/ethereum/go-ethereum/accounts"
    "github.com/ethereum/go-ethereum/common"
    "github.com/ethereum/go-ethereum/common/hexutil"
    "github.com/ethereum/go-ethereum/core/types"
    "github.com/ethereum/go-ethereum/crypto"
    "github.com/ethereum/go-ethereum/log"
    "github.com/ethereum/go-ethereum/rlp"
    ethapi "github.com/ethereum/go-ethereum/internal/ethapi"
    "github.com/ethereum/go-ethereum/rpc"
    "strings"
)

	// X402API provides native x402 payment functionality
type X402API struct {
    eth *Ethereum

    // In-memory replay protection (demo-level; not durable across restarts)
    nonceMu    sync.Mutex
    usedNonces map[common.Address]map[common.Hash]uint64

    // Strict signature verification (production): if true, only accept canonical v2 EIP-191 format
    strictVerify bool
}

// NewX402API creates a new x402 API instance
func NewX402API(eth *Ethereum) *X402API {
    api := &X402API{
        eth:          eth,
        usedNonces:   make(map[common.Address]map[common.Hash]uint64),
    }
    // Strict verify mode (production): enable with X402_STRICT_VERIFY=1|true
    // Also support X402_SIGNATURE_VALIDATION=strict for compatibility with env files
    if sv := os.Getenv("X402_STRICT_VERIFY"); sv == "1" || strings.EqualFold(sv, "true") || strings.EqualFold(os.Getenv("X402_SIGNATURE_VALIDATION"), "strict") {
        api.strictVerify = true
        log.Info("X402: Strict signature verification ENABLED")
    } else {
        log.Info("X402: Strict signature verification DISABLED (dev compatibility)")
    }
    
    // Ensure pseudo-sender account has sufficient ETH for gas
    api.ensurePseudoSenderFunded()
    
    return api
}

// ensurePseudoSenderFunded ensures the x402 pseudo-sender has ETH for gas
func (api *X402API) ensurePseudoSenderFunded() {
    pseudoSender := common.HexToAddress("0x0000000000000000000000000000000000000402")
    
    // Check current balance
    state, err := api.eth.blockchain.State()
    if err != nil {
        log.Warn("X402: Could not get blockchain state to check pseudo-sender balance")
        return
    }
    
    currentBalance := state.GetBalance(pseudoSender)
    requiredBalance := big.NewInt(1000000000000000000) // 1 ETH
    
    if currentBalance.Cmp(requiredBalance) < 0 {
        log.Info("X402: Pseudo-sender needs funding", "current", currentBalance, "required", requiredBalance)
        
        // Try to fund from a system account or coinbase
        // In a real deployment, this would be funded during genesis or by admin
        log.Warn("X402: Pseudo-sender account needs manual funding", 
            "address", pseudoSender.Hex(), 
            "required", "1 ETH",
            "current", currentBalance)
    } else {
        log.Info("X402: Pseudo-sender adequately funded", "balance", currentBalance)
    }
}

    // Helper methods for X402API (nonce tracking and config)

func (api *X402API) isNonceUsed(from common.Address, nonce common.Hash) bool {
	api.nonceMu.Lock()
	defer api.nonceMu.Unlock()
	if byFrom, ok := api.usedNonces[from]; ok {
		_, exists := byFrom[nonce]
		return exists
	}
	return false
}

func (api *X402API) isNonceUsedAndMark(from common.Address, nonce common.Hash) bool {
	api.nonceMu.Lock()
	defer api.nonceMu.Unlock()
	if byFrom, ok := api.usedNonces[from]; ok {
		if _, exists := byFrom[nonce]; exists {
			return true
		}
	} else {
		api.usedNonces[from] = make(map[common.Hash]uint64)
	}
	api.usedNonces[from][nonce] = uint64(time.Now().Unix())
	return false
}

// PaymentRequirements represents x402 payment requirements
type PaymentRequirements struct {
	Scheme              string         `json:"scheme"`
	Network             string         `json:"network"`
	MaxAmountRequired   *hexutil.Big   `json:"maxAmountRequired"`
	Resource            string         `json:"resource"`
	Description         string         `json:"description"`
	MimeType            string         `json:"mimeType"`
	PayTo               common.Address `json:"payTo"`
	MaxTimeoutSeconds   uint64         `json:"maxTimeoutSeconds"`
	Asset               common.Address `json:"asset"`
}

// PaymentPayload represents x402 payment data
type PaymentPayload struct {
	X402Version int                 `json:"x402Version"`
	Scheme      string              `json:"scheme"`
	Network     string              `json:"network"`
	Payload     PaymentPayloadData  `json:"payload"`
}

// PaymentPayloadData contains the actual payment data
type PaymentPayloadData struct {
    From            common.Address `json:"from"`
    To              common.Address `json:"to"`
    Value           *hexutil.Big   `json:"value"`
    ValidAfter      uint64         `json:"validAfter"`
    ValidBefore     uint64         `json:"validBefore"`
    Nonce           common.Hash    `json:"nonce"`
    Asset           common.Address `json:"asset"`
    Signature       hexutil.Bytes  `json:"signature"`
    Permit          *PermitData    `json:"permit,omitempty"`
}

// PermitData carries optional EIP-2612 permit fields for ERC-20 tokens
type PermitData struct {
    Value    *hexutil.Big  `json:"value,omitempty"`
    Deadline *hexutil.Big  `json:"deadline,omitempty"`
    V        uint8         `json:"v,omitempty"`
    R        hexutil.Bytes `json:"r,omitempty"`
    S        hexutil.Bytes `json:"s,omitempty"`
}

// VerificationResponse represents payment verification result
type VerificationResponse struct {
	IsValid       bool   `json:"isValid"`
	InvalidReason string `json:"invalidReason,omitempty"`
	PayerAddress  string `json:"payerAddress,omitempty"`
}

// SettlementResponse represents payment settlement result
type SettlementResponse struct {
	Success   bool        `json:"success"`
	Error     string      `json:"error,omitempty"`
	TxHash    common.Hash `json:"txHash,omitempty"`
	NetworkId string      `json:"networkId,omitempty"`
}

// SupportedResponse represents supported payment schemes
type SupportedResponse struct {
	Kinds []PaymentKind `json:"kinds"`
}

// PaymentKind represents a supported payment type
type PaymentKind struct {
	Scheme  string `json:"scheme"`
	Network string `json:"network"`
}

// Verify validates a payment without executing it
func (api *X402API) Verify(ctx context.Context, requirements PaymentRequirements, payload PaymentPayload) (*VerificationResponse, error) {
	log.Info("X402: Verifying payment", "from", payload.Payload.From, "to", payload.Payload.To, "value", payload.Payload.Value)

	// Basic validation
	if payload.Scheme != "exact" {
		return &VerificationResponse{
			IsValid:       false,
			InvalidReason: "Unsupported payment scheme",
		}, nil
	}

	if payload.Network != "splendor" {
		return &VerificationResponse{
			IsValid:       false,
			InvalidReason: "Unsupported network",
		}, nil
	}

	// Check timestamp validity
	now := uint64(time.Now().Unix())
	if now < payload.Payload.ValidAfter {
		return &VerificationResponse{
			IsValid:       false,
			InvalidReason: "Payment not yet valid",
		}, nil
	}

	if now > payload.Payload.ValidBefore {
		return &VerificationResponse{
			IsValid:       false,
			InvalidReason: "Payment expired",
		}, nil
	}

	// Verify signature
	if !api.verifyPaymentSignature(payload.Payload) {
		return &VerificationResponse{
			IsValid:       false,
			InvalidReason: "Invalid signature",
		}, nil
	}

	// Check balance using state (native only; TODO: add ERC-20 balance check)
	state, err := api.eth.blockchain.State()
	if err != nil {
		return &VerificationResponse{
			IsValid:       false,
			InvalidReason: "Could not get blockchain state",
		}, nil
	}

    if payload.Payload.Asset == (common.Address{}) {
        balance := state.GetBalance(payload.Payload.From)
        requiredAmount := (*big.Int)(payload.Payload.Value)

        if balance.Cmp(requiredAmount) < 0 {
            return &VerificationResponse{
                IsValid:       false,
                InvalidReason: "Insufficient balance",
            }, nil
        }
    } else {
        // ERC-20 asset: verify token balance via eth_call on balanceOf(address)
        bal, err := api.erc20Balance(ctx, payload.Payload.Asset, payload.Payload.From)
        if err != nil {
            log.Warn("X402: ERC-20 balance check failed", "asset", payload.Payload.Asset, "owner", payload.Payload.From, "err", err)
            return &VerificationResponse{
                IsValid:       false,
                InvalidReason: "Could not query token balance",
            }, nil
        }
        requiredAmount := (*big.Int)(payload.Payload.Value)
        if bal.Cmp(requiredAmount) < 0 {
            return &VerificationResponse{
                IsValid:       false,
                InvalidReason: "Insufficient token balance",
            }, nil
        }
        // If a permit is provided, simulate it; otherwise require allowance.
        if payload.Payload.Permit != nil {
            // Basic field checks
            if payload.Payload.Permit.Value != nil {
                if (*big.Int)(payload.Payload.Permit.Value).Cmp(requiredAmount) < 0 {
                    return &VerificationResponse{IsValid: false, InvalidReason: "Permit value below required amount"}, nil
                }
            }
            // Check deadline if provided
            if payload.Payload.Permit.Deadline != nil {
                if (*big.Int)(payload.Payload.Permit.Deadline).Cmp(new(big.Int).SetUint64(uint64(time.Now().Unix()))) < 0 {
                    return &VerificationResponse{IsValid: false, InvalidReason: "Permit deadline expired"}, nil
                }
            }
            // Simulate permit(owner, spender, value, deadline, v, r, s)
            ok, perr := api.erc20SimPermit(
                ctx,
                payload.Payload.Asset,
                payload.Payload.From,
                payload.Payload.To,
                (*big.Int)(payload.Payload.Permit.Value),
                (*big.Int)(payload.Payload.Permit.Deadline),
                payload.Payload.Permit.V,
                []byte(payload.Payload.Permit.R),
                []byte(payload.Payload.Permit.S),
            )
            if perr != nil || !ok {
                log.Warn("X402: ERC-20 permit simulation failed; falling back to allowance", "err", perr)
                // Fall through to allowance check
                allowance, aerr := api.erc20Allowance(ctx, payload.Payload.Asset, payload.Payload.From, payload.Payload.To)
                if aerr != nil {
                    return &VerificationResponse{IsValid: false, InvalidReason: "Could not query token allowance"}, nil
                }
                if allowance.Cmp(requiredAmount) < 0 {
                    return &VerificationResponse{IsValid: false, InvalidReason: "Insufficient token allowance"}, nil
                }
            }
        } else {
            // No permit provided: require allowance
            allowance, aerr := api.erc20Allowance(ctx, payload.Payload.Asset, payload.Payload.From, payload.Payload.To)
            if aerr != nil {
                return &VerificationResponse{IsValid: false, InvalidReason: "Could not query token allowance"}, nil
            }
            if allowance.Cmp(requiredAmount) < 0 {
                return &VerificationResponse{IsValid: false, InvalidReason: "Insufficient token allowance"}, nil
            }
        }
    }

	// For "exact" scheme, we accept any payment amount - no limits enforced
	// The maxAmountRequired field is informational only for client reference

	// Verify recipient matches requirements
	if payload.Payload.To != requirements.PayTo {
		return &VerificationResponse{
			IsValid:       false,
			InvalidReason: "Payment recipient mismatch",
		}, nil
	}

	// Verify asset matches requirements
	if payload.Payload.Asset != requirements.Asset {
		return &VerificationResponse{
			IsValid:       false,
			InvalidReason: "Payment asset mismatch",
		}, nil
	}

	// Check nonce replay (best-effort, in-memory)
	if api.isNonceUsed(payload.Payload.From, payload.Payload.Nonce) {
		return &VerificationResponse{
			IsValid:       false,
			InvalidReason: "Payment nonce already used",
		}, nil
	}

	return &VerificationResponse{
		IsValid:      true,
		PayerAddress: payload.Payload.From.Hex(),
	}, nil
}

// Settle executes a verified payment
func (api *X402API) Settle(ctx context.Context, requirements PaymentRequirements, payload PaymentPayload) (*SettlementResponse, error) {
    log.Info("X402: Settling payment", "from", payload.Payload.From, "to", payload.Payload.To, "value", payload.Payload.Value)

	// First verify the payment
	verification, err := api.Verify(ctx, requirements, payload)
	if err != nil {
		return &SettlementResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	if !verification.IsValid {
		return &SettlementResponse{
			Success: false,
			Error:   verification.InvalidReason,
		}, nil
	}

	// Atomically check-and-mark nonce to prevent replay
	if api.isNonceUsedAndMark(payload.Payload.From, payload.Payload.Nonce) {
		return &SettlementResponse{
			Success: false,
			Error:   "payment nonce already used",
		}, nil
	}

	// Build typed X402 consensus transaction (system tx) and submit to txpool
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
	// Prepare payload (use the same signature and fields already verified above)
    p := x402Payload{
        From:        payload.Payload.From,
        To:          payload.Payload.To,
        Value:       (*big.Int)(payload.Payload.Value),
        ValidAfter:  payload.Payload.ValidAfter,
        ValidBefore: payload.Payload.ValidBefore,
        Nonce:       payload.Payload.Nonce,
        Asset:       payload.Payload.Asset,
        Signature:   append([]byte(nil), payload.Payload.Signature...),
    }
    if payload.Payload.Permit != nil {
        // Fill optional permit
        var val, dl *big.Int
        if payload.Payload.Permit.Value != nil { val = (*big.Int)(payload.Payload.Permit.Value) } else { val = new(big.Int) }
        if payload.Payload.Permit.Deadline != nil { dl = (*big.Int)(payload.Payload.Permit.Deadline) } else { dl = new(big.Int) }
        p.Permit = &x402Permit{
            Value:    val,
            Deadline: dl,
            V:        payload.Payload.Permit.V,
            R:        append([]byte(nil), payload.Payload.Permit.R...),
            S:        append([]byte(nil), payload.Payload.Permit.S...),
        }
    }
    enc, err := rlp.EncodeToBytes(&p)
    if err != nil {
        return &SettlementResponse{Success: false, Error: fmt.Sprintf("x402: encode payload failed: %v", err)}, nil
    }
    chainID := api.eth.blockchain.Config().ChainID
    // Provide a unique envelope nonce derived from the payment nonce (avoid txpool overlaps)
    var envNonce uint64
    nb := payload.Payload.Nonce.Bytes()
    if len(nb) >= 8 {
        envNonce = binary.BigEndian.Uint64(nb[len(nb)-8:])
    } else {
        envNonce = uint64(time.Now().UnixNano())
    }
    xTx := types.NewX402Tx(chainID, envNonce, nil, enc)

    // CRITICAL FIX: Sign the x402 transaction envelope to ensure it's properly indexed
    // Use a dummy signature for the envelope (the real signature is in the payload)
    signer := types.LatestSignerForChainID(chainID)
    
    // Create a dummy signature bytes (65 bytes: r=32, s=32, v=1)
    dummySig := make([]byte, 65)
    // Set r to 1 (32 bytes)
    dummySig[31] = 1
    // Set s to 1 (32 bytes) 
    dummySig[63] = 1
    // Set v to 27
    dummySig[64] = 27
    
    signedTx, err := xTx.WithSignature(signer, dummySig)
    if err != nil {
        return &SettlementResponse{Success: false, Error: fmt.Sprintf("x402: sign envelope failed: %v", err)}, nil
    }

    log.Info("X402: Created signed transaction envelope", "hash", signedTx.Hash(), "nonce", envNonce)

    // Submit the x402 envelope to the txpool so consensus settles it on-chain
    if err := api.eth.TxPool().AddLocal(signedTx); err != nil {
        return &SettlementResponse{Success: false, Error: fmt.Sprintf("x402: add to txpool failed: %v", err)}, nil
    }

    // CRITICAL FIX: Ensure x402 transaction is properly broadcasted to validators
    // Get the broadcast manager from the Ethereum backend
    if broadcastManager := api.eth.GetX402BroadcastManager(); broadcastManager != nil {
        broadcastManager.AddX402Transaction(signedTx)
        log.Info("X402: Transaction added to broadcast manager", "hash", signedTx.Hash())
    } else {
        log.Warn("X402: Broadcast manager not available, transaction may not be broadcasted properly")
    }

    return &SettlementResponse{
        Success:   true,
        TxHash:    signedTx.Hash(),
        NetworkId: "splendor",
    }, nil
}

// Supported returns supported payment schemes and networks
func (api *X402API) Supported(ctx context.Context) (*SupportedResponse, error) {
	return &SupportedResponse{
		Kinds: []PaymentKind{
			{
				Scheme:  "exact",
				Network: "splendor",
			},
		},
	}, nil
}

// verifyPaymentSignature verifies the payment signature
func (api *X402API) verifyPaymentSignature(payload PaymentPayloadData) bool {
	// Strict production mode: only accept canonical v2 (with chainId) and EIP-191 prefix, checksum addresses, hex value
	chainIDStrict := api.eth.networkID
	if api.strictVerify {
		valHex := payload.Value.String()
		// Include asset in the signed message to prevent cross-asset replay
		msg := fmt.Sprintf("x402-payment:%s:%s:%s:%d:%d:%s:%s:%d",
			payload.From.Hex(),
			payload.To.Hex(),
			valHex,
			payload.ValidAfter,
			payload.ValidBefore,
			payload.Nonce.Hex(),
			payload.Asset.Hex(),
			chainIDStrict,
		)
		// Signature checks
		sig := make([]byte, len(payload.Signature))
		copy(sig, payload.Signature)
		if len(sig) != 65 {
			return false
		}
		if sig[64] >= 27 {
			sig[64] -= 27
		}
		hash := accounts.TextHash([]byte(msg))
		if pub, err := crypto.SigToPub(hash, sig); err == nil {
			return crypto.PubkeyToAddress(*pub) == payload.From
		}
		return false
	}

	// Be permissive: try address case variants (checksum/lower), value encodings (hex/dec),
	// message versions (v2 with chainId, v1 without), and both EIP-191 prefixed and raw hashes.
	chainID := api.eth.networkID

	// Prepare address strings (checksum and lowercase)
	fromChecksum := payload.From.Hex()
	toChecksum := payload.To.Hex()
	fromLower := strings.ToLower(fromChecksum)
	toLower := strings.ToLower(toChecksum)
	// Prepare asset strings (checksum and lowercase)
	assetChecksum := payload.Asset.Hex()
	assetLower := strings.ToLower(assetChecksum)

	// Prepare value strings
	valHex := payload.Value.String() // hexutil.Big typically prints 0x...
	valDec := (*big.Int)(payload.Value).String()

	// Build candidate message strings (include asset to bind signature to token)
	var msgs []string
	addrPairs := [][2]string{
		{fromChecksum, toChecksum},
		{fromLower, toLower},
	}
	vals := []string{valHex, valDec}
	assets := []string{assetChecksum, assetLower}

	for _, ap := range addrPairs {
		for _, v := range vals {
			for _, a := range assets {
				// v2 (with chainId)
				msgs = append(msgs, fmt.Sprintf("x402-payment:%s:%s:%s:%d:%d:%s:%s:%d",
					ap[0], ap[1], v, payload.ValidAfter, payload.ValidBefore, payload.Nonce.Hex(), a, chainID))
				// v1 (without chainId)
				msgs = append(msgs, fmt.Sprintf("x402-payment:%s:%s:%s:%d:%d:%s:%s",
					ap[0], ap[1], v, payload.ValidAfter, payload.ValidBefore, payload.Nonce.Hex(), a))
			}
		}
	}

	// Signature copy and sanity
	sig := make([]byte, len(payload.Signature))
	copy(sig, payload.Signature)
	if len(sig) != 65 {
		log.Warn("X402: signature length invalid", "len", len(sig))
		return false
	}
	if sig[64] >= 27 {
		sig[64] -= 27
	}
	log.Info("X402: signature meta", "len", len(sig), "v", int(sig[64]))

	recoverAddr := func(hash []byte) (common.Address, bool) {
		var zero common.Address
		pub, err := crypto.SigToPub(hash, sig)
		if err != nil {
			log.Info("X402: SigToPub error", "err", err)
			return zero, false
		}
		addr := crypto.PubkeyToAddress(*pub)
		return addr, true
	}

	for _, m := range msgs {
		// EIP-191 prefixed
		hashPrefixed := accounts.TextHash([]byte(m))
		if rec, ok := recoverAddr(hashPrefixed); ok {
			if rec == payload.From {
				return true
			}
			log.Info("X402: recover mismatch (prefixed)", "msg", m, "recovered", rec, "expected", payload.From)
		}
		// Raw (eth_sign style)
		hashRaw := crypto.Keccak256([]byte(m))
		if rec, ok := recoverAddr(hashRaw); ok {
			if rec == payload.From {
				return true
			}
			log.Info("X402: recover mismatch (raw)", "msg", m, "recovered", rec, "expected", payload.From)
		}
	}
	log.Warn("X402: signature did not match any accepted message variants",
		"from", fromChecksum, "to", toChecksum, "valHex", valHex, "valDec", valDec, "chainId", chainID)
	return false
}


// erc20Balance queries the ERC-20 token balance for the given owner via eth_call
func (api *X402API) erc20Balance(ctx context.Context, token common.Address, owner common.Address) (*big.Int, error) {
    // Build calldata: balanceOf(address)
    // methodID = keccak256("balanceOf(address)")[:4] = 0x70a08231
    methodID := crypto.Keccak256([]byte("balanceOf(address)"))[:4]
    var data []byte
    data = append(data, methodID...)
    data = append(data, common.LeftPadBytes(owner.Bytes(), 32)...)

    to := token
    input := hexutil.Bytes(data)
    args := ethapi.TransactionArgs{
        To:   &to,
        Data: &input,
    }
    latest := rpc.BlockNumberOrHashWithNumber(rpc.LatestBlockNumber)
    // Call EVM using the node's API backend, at latest block
    res, err := ethapi.DoCall(ctx, api.eth.APIBackend, args, latest, nil, api.eth.APIBackend.RPCEVMTimeout(), api.eth.APIBackend.RPCGasCap())
    if err != nil {
        return nil, err
    }
    // On success, ERC-20 balanceOf returns a 32-byte big-endian uint256
    out := res.Return()
    if len(out) == 0 {
        return big.NewInt(0), nil
    }
    return new(big.Int).SetBytes(out), nil
}

// erc20Allowance queries the ERC-20 allowance for owner->spender
func (api *X402API) erc20Allowance(ctx context.Context, token common.Address, owner, spender common.Address) (*big.Int, error) {
    // methodID = keccak256("allowance(address,address)")[:4] = 0xdd62ed3e
    methodID := crypto.Keccak256([]byte("allowance(address,address)"))[:4]
    var data []byte
    data = append(data, methodID...)
    data = append(data, common.LeftPadBytes(owner.Bytes(), 32)...)
    data = append(data, common.LeftPadBytes(spender.Bytes(), 32)...)

    to := token
    input := hexutil.Bytes(data)
    args := ethapi.TransactionArgs{
        To:   &to,
        Data: &input,
    }
    latest := rpc.BlockNumberOrHashWithNumber(rpc.LatestBlockNumber)
    res, err := ethapi.DoCall(ctx, api.eth.APIBackend, args, latest, nil, api.eth.APIBackend.RPCEVMTimeout(), api.eth.APIBackend.RPCGasCap())
    if err != nil {
        return nil, err
    }
    out := res.Return()
    if len(out) == 0 {
        return big.NewInt(0), nil
    }
    return new(big.Int).SetBytes(out), nil
}

// erc20SimPermit simulates an EIP-2612 permit call; returns true if it would succeed
func (api *X402API) erc20SimPermit(
    ctx context.Context,
    token, owner, spender common.Address,
    value, deadline *big.Int,
    v uint8, r, s []byte,
) (bool, error) {
    // methodID = keccak256("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)")[:4]
    methodID := crypto.Keccak256([]byte("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"))[:4]
    var data []byte
    data = append(data, methodID...)
    data = append(data, common.LeftPadBytes(owner.Bytes(), 32)...)
    data = append(data, common.LeftPadBytes(spender.Bytes(), 32)...)
    if value == nil { value = new(big.Int) }
    if deadline == nil { deadline = new(big.Int).SetUint64(^uint64(0)) } // max uint64 as default
    data = append(data, common.LeftPadBytes(value.Bytes(), 32)...)
    data = append(data, common.LeftPadBytes(deadline.Bytes(), 32)...)
    // v as uint8 padded
    data = append(data, common.LeftPadBytes([]byte{byte(v)}, 32)...)
    // r and s as 32-byte each
    if len(r) != 32 || len(s) != 32 {
        // try to left-pad if shorter
        r = common.LeftPadBytes(r, 32)
        s = common.LeftPadBytes(s, 32)
    }
    data = append(data, r...)
    data = append(data, s...)

    to := token
    input := hexutil.Bytes(data)
    args := ethapi.TransactionArgs{ To: &to, Data: &input }
    latest := rpc.BlockNumberOrHashWithNumber(rpc.LatestBlockNumber)
    res, err := ethapi.DoCall(ctx, api.eth.APIBackend, args, latest, nil, api.eth.APIBackend.RPCEVMTimeout(), api.eth.APIBackend.RPCGasCap())
    if err != nil {
        return false, err
    }
    if len(res.Revert()) > 0 || res.Err != nil {
        return false, nil
    }
    return true, nil
}


// (demo helpers removed; settlement now goes through consensus via typed x402 tx)

// GetPaymentHistory returns payment history for an address
func (api *X402API) GetPaymentHistory(ctx context.Context, address common.Address, limit int) ([]PaymentRecord, error) {
	// This would be implemented with proper storage in a production system
	return []PaymentRecord{}, nil
}

// PaymentRecord represents a historical payment record
type PaymentRecord struct {
	TxHash      common.Hash    `json:"txHash"`
	From        common.Address `json:"from"`
	To          common.Address `json:"to"`
	Amount      *hexutil.Big   `json:"amount"`
	Timestamp   uint64         `json:"timestamp"`
	Resource    string         `json:"resource"`
	Status      string         `json:"status"`
}

// GetPaymentStats returns payment statistics
func (api *X402API) GetPaymentStats(ctx context.Context) (*PaymentStats, error) {
	return &PaymentStats{
		TotalPayments:     0,
		TotalVolume:       (*hexutil.Big)(big.NewInt(0)),
		AveragePayment:    (*hexutil.Big)(big.NewInt(0)),
		ActiveUsers:       0,
		PaymentsToday:     0,
		VolumeToday:       (*hexutil.Big)(big.NewInt(0)),
	}, nil
}

// PaymentStats represents payment statistics
type PaymentStats struct {
	TotalPayments     uint64       `json:"totalPayments"`
	TotalVolume       *hexutil.Big `json:"totalVolume"`
	AveragePayment    *hexutil.Big `json:"averagePayment"`
	ActiveUsers       uint64       `json:"activeUsers"`
	PaymentsToday     uint64       `json:"paymentsToday"`
	VolumeToday       *hexutil.Big `json:"volumeToday"`
}
