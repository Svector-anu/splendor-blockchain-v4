// Copyright 2024 Splendor Blockchain
// X402 Transaction Broadcasting Fix

package eth

import (
	"fmt"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/event"
	"github.com/ethereum/go-ethereum/log"
)

// X402BroadcastManager handles proper broadcasting of x402 transactions
type X402BroadcastManager struct {
	eth           *Ethereum
	pendingX402   map[common.Hash]*types.Transaction
	mu            sync.RWMutex
	broadcastCh   chan *types.Transaction
	stopCh        chan struct{}
	wg            sync.WaitGroup
	txsCh         chan core.NewTxsEvent
	txsSub        event.Subscription
}

// NewX402BroadcastManager creates a new x402 broadcast manager
func NewX402BroadcastManager(eth *Ethereum) *X402BroadcastManager {
	manager := &X402BroadcastManager{
		eth:         eth,
		pendingX402: make(map[common.Hash]*types.Transaction),
		broadcastCh: make(chan *types.Transaction, 100),
		stopCh:      make(chan struct{}),
		txsCh:       make(chan core.NewTxsEvent, 100),
	}
	
	// Subscribe to new transactions from the txpool
	manager.txsSub = eth.txPool.SubscribeNewTxsEvent(manager.txsCh)
	
	// Start the broadcast worker
	manager.wg.Add(1)
	go manager.broadcastWorker()
	
	// Start the transaction monitor to catch new X402 transactions
	manager.wg.Add(1)
	go manager.txMonitor()
	
	// Subscribe to new mined blocks to remove confirmed x402 transactions
	manager.wg.Add(1)
	go manager.blockMonitor()
	
	return manager
}

// Stop stops the broadcast manager
func (m *X402BroadcastManager) Stop() {
	m.txsSub.Unsubscribe()
	close(m.stopCh)
	m.wg.Wait()
}

// AddX402Transaction adds an x402 transaction for broadcasting
func (m *X402BroadcastManager) AddX402Transaction(tx *types.Transaction) {
	if tx.Type() != types.X402TxType {
		return
	}
	
	m.mu.Lock()
	defer m.mu.Unlock()
	
	hash := tx.Hash()
	if _, exists := m.pendingX402[hash]; !exists {
		m.pendingX402[hash] = tx
		log.Info("X402: Added transaction for broadcasting", "hash", hash)
		
		// Send to broadcast channel
		select {
		case m.broadcastCh <- tx:
		default:
			log.Warn("X402: Broadcast channel full, dropping transaction", "hash", hash)
		}
	}
}

// RemoveX402Transaction removes an x402 transaction (when mined)
func (m *X402BroadcastManager) RemoveX402Transaction(hash common.Hash) {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	if _, exists := m.pendingX402[hash]; exists {
		delete(m.pendingX402, hash)
		log.Info("X402: Removed mined transaction", "hash", hash)
	}
}

// txMonitor listens for new transactions from the txpool and adds X402 transactions for broadcasting
func (m *X402BroadcastManager) txMonitor() {
	defer m.wg.Done()
	defer func() {
		if r := recover(); r != nil {
			log.Error("X402: Transaction monitor panic recovered", "error", r)
		}
	}()
	
	for {
		select {
		case ev := <-m.txsCh:
			// Check each transaction in the event
			for _, tx := range ev.Txs {
				if tx.Type() == types.X402TxType {
					m.AddX402Transaction(tx)
				}
			}
			
		case <-m.stopCh:
			return
		}
	}
}

// broadcastWorker handles the actual broadcasting of x402 transactions
func (m *X402BroadcastManager) broadcastWorker() {
	defer m.wg.Done()
	defer func() {
		if r := recover(); r != nil {
			log.Error("X402: Broadcast worker panic recovered", "error", r)
		}
	}()
	
	ticker := time.NewTicker(5 * time.Second) // Broadcast every 5 seconds
	defer ticker.Stop()
	
	for {
		select {
		case tx := <-m.broadcastCh:
			m.broadcastX402Transaction(tx)
			
		case <-ticker.C:
			// Re-broadcast pending x402 transactions
			m.rebroadcastPending()
			
		case <-m.stopCh:
			return
		}
	}
}

// broadcastX402Transaction broadcasts a single x402 transaction to peers
func (m *X402BroadcastManager) broadcastX402Transaction(tx *types.Transaction) {
	if tx.Type() != types.X402TxType {
		return
	}
	
	// Check if handler is initialized before attempting broadcast
	if m.eth.handler == nil {
		log.Warn("X402: Handler not initialized, skipping broadcast", "hash", tx.Hash())
		return
	}
	
	// Use the handler's BroadcastTransactions method which properly handles peer selection
	// and transaction broadcasting according to the network protocol
	m.eth.handler.BroadcastTransactions([]*types.Transaction{tx})
	
	log.Info("X402: Broadcasted transaction to network", "hash", tx.Hash())
}

// rebroadcastPending re-broadcasts all pending x402 transactions
func (m *X402BroadcastManager) rebroadcastPending() {
	m.mu.RLock()
	pending := make([]*types.Transaction, 0, len(m.pendingX402))
	for _, tx := range m.pendingX402 {
		pending = append(pending, tx)
	}
	m.mu.RUnlock()
	
	if len(pending) == 0 {
		return
	}
	
	log.Debug("X402: Re-broadcasting pending transactions", "count", len(pending))
	
	for _, tx := range pending {
		// Check if transaction is still in mempool
		if m.eth.TxPool().Get(tx.Hash()) != nil {
			m.broadcastX402Transaction(tx)
		} else {
			// Transaction no longer in pool, remove from pending
			m.RemoveX402Transaction(tx.Hash())
		}
	}
}

// GetPendingCount returns the number of pending x402 transactions
func (m *X402BroadcastManager) GetPendingCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.pendingX402)
}

// X402SyncManager handles synchronization issues with x402 transactions
type X402SyncManager struct {
	eth           *Ethereum
	lastSyncCheck time.Time
	syncIssues    int
	mu            sync.RWMutex
}

// NewX402SyncManager creates a new sync manager
func NewX402SyncManager(eth *Ethereum) *X402SyncManager {
	return &X402SyncManager{
		eth:           eth,
		lastSyncCheck: time.Now(),
	}
}

// CheckSyncStatus checks if the node is properly synced
func (m *X402SyncManager) CheckSyncStatus() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	// Check if we're behind on blocks
	currentBlock := m.eth.blockchain.CurrentBlock()
	if currentBlock == nil {
		return fmt.Errorf("no current block available")
	}
	
	// Check peer count
	peerCount := m.eth.handler.peers.len()
	if peerCount == 0 {
		m.syncIssues++
		return fmt.Errorf("no peers connected")
	}
	
	// Check if we're receiving new blocks
	timeSinceLastBlock := time.Since(time.Unix(int64(currentBlock.Time()), 0))
	if timeSinceLastBlock > 30*time.Second {
		m.syncIssues++
		log.Warn("X402: Node may be out of sync", "timeSinceLastBlock", timeSinceLastBlock, "currentBlock", currentBlock.Number())
		return fmt.Errorf("node appears to be out of sync")
	}
	
	// Reset sync issues counter if everything looks good
	if m.syncIssues > 0 {
		log.Info("X402: Sync status recovered", "previousIssues", m.syncIssues)
		m.syncIssues = 0
	}
	
	m.lastSyncCheck = time.Now()
	return nil
}

// GetSyncIssues returns the number of sync issues detected
func (m *X402SyncManager) GetSyncIssues() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.syncIssues
}

// ForceResync forces a resync with peers
func (m *X402SyncManager) ForceResync() error {
	log.Info("X402: Forcing resync with peers")
	
	// Trigger a peer event to force the chain syncer to check for sync opportunities
	// This is safer than directly calling doSync as it goes through the proper sync logic
	if bestPeer := m.eth.handler.peers.peerWithHighestTD(); bestPeer != nil {
		m.eth.handler.chainSync.handlePeerEvent(bestPeer)
		log.Info("X402: Triggered sync check with best peer", "peer", bestPeer.ID())
		return nil
	}
	
	return fmt.Errorf("no peers available for sync")
}

// blockMonitor monitors new blocks and removes mined x402 transactions
func (m *X402BroadcastManager) blockMonitor() {
	defer m.wg.Done()
	defer func() {
		if r := recover(); r != nil {
			log.Error("X402: Block monitor panic recovered", "error", r)
		}
	}()
	
	ticker := time.NewTicker(10 * time.Second) // Check every 10 seconds
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			// Check if any pending x402 transactions have been mined
			m.checkMinedTransactions()
			
		case <-m.stopCh:
			return
		}
	}
}

// checkMinedTransactions checks if any pending x402 transactions have been mined
func (m *X402BroadcastManager) checkMinedTransactions() {
	m.mu.RLock()
	pendingHashes := make([]common.Hash, 0, len(m.pendingX402))
	for hash := range m.pendingX402 {
		pendingHashes = append(pendingHashes, hash)
	}
	m.mu.RUnlock()
	
	if len(pendingHashes) == 0 {
		return
	}
	
	// Check each pending transaction to see if it's been mined
	for _, hash := range pendingHashes {
		// Check if transaction is no longer in mempool (likely mined)
		if m.eth.TxPool().Get(hash) == nil {
			// Double-check by looking for the transaction in recent blocks
			currentBlock := m.eth.blockchain.CurrentBlock()
			if currentBlock != nil {
				// Check last few blocks for the transaction
				for i := uint64(0); i < 5 && currentBlock != nil; i++ {
					block := m.eth.blockchain.GetBlock(currentBlock.Hash(), currentBlock.NumberU64()-i)
					if block != nil {
						for _, tx := range block.Transactions() {
							if tx.Hash() == hash {
								m.RemoveX402Transaction(hash)
								log.Info("X402: Transaction confirmed in block", "hash", hash, "block", block.NumberU64())
								goto nextTx
							}
						}
					}
				}
				// If not found in recent blocks but not in mempool, assume it was dropped or mined
				m.RemoveX402Transaction(hash)
				log.Debug("X402: Transaction no longer in mempool, removing from pending", "hash", hash)
			}
		nextTx:
		}
	}
}
