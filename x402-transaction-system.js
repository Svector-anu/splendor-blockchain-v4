#!/usr/bin/env node

/**
 * X402 Transaction Verification System
 * Creates a comprehensive system for tracking, verifying, and displaying X402 transactions
 * Includes block explorer integration and transaction receipt generation
 */

import { ethers } from 'ethers';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Configuration
const RPC_URL = process.env.RPC_URL || 'http://31.97.134.210';
const PRIVATE_KEY = process.env.PRIVATE_KEY || 'YOUR_PRIVATE_KEY_HERE';
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '2691');

// X402 Transaction Database (in production, use a real database)
const X402_DB_FILE = 'x402-transactions.json';

class X402TransactionSystem {
    constructor() {
        this.transactions = this.loadTransactions();
    }

    // Load existing transactions from file
    loadTransactions() {
        try {
            if (fs.existsSync(X402_DB_FILE)) {
                const data = fs.readFileSync(X402_DB_FILE, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.log('Creating new transaction database...');
        }
        return {};
    }

    // Save transactions to file
    saveTransactions() {
        fs.writeFileSync(X402_DB_FILE, JSON.stringify(this.transactions, null, 2));
    }

    // Record a new X402 transaction
    recordTransaction(txHash, paymentData, verifyResult, settleResult) {
        const timestamp = new Date().toISOString();
        const blockNumber = Date.now(); // In production, get actual block number
        
        this.transactions[txHash] = {
            // Basic transaction info
            hash: txHash,
            type: 'x402',
            timestamp,
            blockNumber,
            status: settleResult.success ? 'confirmed' : 'failed',
            
            // X402 specific data
            from: paymentData.payload.from,
            to: paymentData.payload.to,
            value: paymentData.payload.value,
            asset: paymentData.payload.asset,
            nonce: paymentData.payload.nonce,
            signature: paymentData.payload.signature,
            
            // Validation info
            isValid: verifyResult.isValid,
            payerAddress: verifyResult.payerAddress,
            
            // Settlement info
            networkId: settleResult.networkId,
            success: settleResult.success,
            
            // Timing info
            validAfter: paymentData.payload.validAfter,
            validBefore: paymentData.payload.validBefore,
            
            // Additional metadata
            resource: paymentData.resource || 'unknown',
            description: paymentData.description || 'X402 Payment',
            
            // Block explorer data
            explorerData: {
                gasUsed: '0x0', // X402 transactions are gasless
                gasPrice: '0x0',
                cumulativeGasUsed: '0x0',
                effectiveGasPrice: '0x0',
                logs: [],
                logsBloom: '0x0',
                transactionIndex: '0x0',
                confirmations: 1
            }
        };
        
        this.saveTransactions();
        return this.transactions[txHash];
    }

    // Get transaction by hash (like eth_getTransactionByHash but for X402)
    getTransaction(txHash) {
        return this.transactions[txHash] || null;
    }

    // Generate a transaction receipt (like eth_getTransactionReceipt but for X402)
    getTransactionReceipt(txHash) {
        const tx = this.transactions[txHash];
        if (!tx) return null;

        return {
            transactionHash: tx.hash,
            transactionIndex: tx.explorerData.transactionIndex,
            blockHash: `0x${tx.blockNumber.toString(16).padStart(64, '0')}`,
            blockNumber: `0x${tx.blockNumber.toString(16)}`,
            from: tx.from,
            to: tx.to,
            cumulativeGasUsed: tx.explorerData.cumulativeGasUsed,
            effectiveGasPrice: tx.explorerData.effectiveGasPrice,
            gasUsed: tx.explorerData.gasUsed,
            contractAddress: null,
            logs: tx.explorerData.logs,
            logsBloom: tx.explorerData.logsBloom,
            type: '0x50', // X402 transaction type
            status: tx.success ? '0x1' : '0x0',
            
            // X402 specific fields
            x402: {
                asset: tx.asset,
                value: tx.value,
                nonce: tx.nonce,
                signature: tx.signature,
                payerAddress: tx.payerAddress,
                networkId: tx.networkId,
                resource: tx.resource,
                description: tx.description
            }
        };
    }

    // Get all transactions for an address
    getTransactionsByAddress(address) {
        return Object.values(this.transactions).filter(tx => 
            tx.from.toLowerCase() === address.toLowerCase() || 
            tx.to.toLowerCase() === address.toLowerCase()
        );
    }

    // Get transaction count for an address
    getTransactionCount(address) {
        return this.getTransactionsByAddress(address).length;
    }

    // Generate block explorer compatible data
    generateBlockExplorerData(txHash) {
        const tx = this.getTransaction(txHash);
        const receipt = this.getTransactionReceipt(txHash);
        
        if (!tx || !receipt) return null;

        return {
            // Standard block explorer fields
            hash: tx.hash,
            status: tx.success ? 'Success' : 'Failed',
            block: tx.blockNumber,
            timestamp: tx.timestamp,
            from: tx.from,
            to: tx.to,
            value: `${parseInt(tx.value, 16)} units`,
            transactionFee: '0 SPLD', // Gasless
            gasPrice: '0 gwei',
            gasLimit: '0',
            gasUsed: '0',
            
            // X402 specific fields
            type: 'X402 Payment',
            asset: tx.asset,
            payerVerified: tx.isValid,
            signature: tx.signature,
            nonce: tx.nonce,
            networkId: tx.networkId,
            resource: tx.resource,
            description: tx.description,
            
            // Validation window
            validFrom: new Date(tx.validAfter * 1000).toISOString(),
            validUntil: new Date(tx.validBefore * 1000).toISOString(),
            
            // Receipt data
            receipt: receipt
        };
    }

    // Export transactions for block explorer
    exportForBlockExplorer() {
        const exportData = {
            totalTransactions: Object.keys(this.transactions).length,
            transactions: Object.keys(this.transactions).map(hash => 
                this.generateBlockExplorerData(hash)
            ),
            lastUpdated: new Date().toISOString()
        };
        
        fs.writeFileSync('x402-block-explorer-data.json', JSON.stringify(exportData, null, 2));
        return exportData;
    }

    // Generate HTML block explorer page
    generateBlockExplorerHTML() {
        const transactions = Object.values(this.transactions);
        
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>X402 Transaction Explorer</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .header { text-align: center; margin-bottom: 30px; }
        .stats { display: flex; justify-content: space-around; margin-bottom: 30px; }
        .stat-box { background: #007bff; color: white; padding: 20px; border-radius: 8px; text-align: center; }
        .transaction { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 8px; }
        .tx-hash { font-family: monospace; color: #007bff; font-weight: bold; }
        .success { border-left: 4px solid #28a745; }
        .failed { border-left: 4px solid #dc3545; }
        .details { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
        .detail { background: #f8f9fa; padding: 8px; border-radius: 4px; }
        .label { font-weight: bold; color: #495057; }
        .value { font-family: monospace; color: #6c757d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔗 X402 Transaction Explorer</h1>
            <p>Splendor Blockchain X402 Payment System</p>
        </div>
        
        <div class="stats">
            <div class="stat-box">
                <h3>${transactions.length}</h3>
                <p>Total X402 Transactions</p>
            </div>
            <div class="stat-box">
                <h3>${transactions.filter(tx => tx.success).length}</h3>
                <p>Successful Payments</p>
            </div>
            <div class="stat-box">
                <h3>${new Set(transactions.map(tx => tx.from)).size}</h3>
                <p>Unique Payers</p>
            </div>
        </div>
        
        <h2>Recent X402 Transactions</h2>
        ${transactions.map(tx => `
            <div class="transaction ${tx.success ? 'success' : 'failed'}">
                <div class="tx-hash">🧾 ${tx.hash}</div>
                <div class="details">
                    <div class="detail">
                        <div class="label">Status:</div>
                        <div class="value">${tx.success ? '✅ Success' : '❌ Failed'}</div>
                    </div>
                    <div class="detail">
                        <div class="label">Timestamp:</div>
                        <div class="value">${new Date(tx.timestamp).toLocaleString()}</div>
                    </div>
                    <div class="detail">
                        <div class="label">From:</div>
                        <div class="value">${tx.from}</div>
                    </div>
                    <div class="detail">
                        <div class="label">To:</div>
                        <div class="value">${tx.to}</div>
                    </div>
                    <div class="detail">
                        <div class="label">Value:</div>
                        <div class="value">${parseInt(tx.value, 16)} units</div>
                    </div>
                    <div class="detail">
                        <div class="label">Asset:</div>
                        <div class="value">${tx.asset}</div>
                    </div>
                    <div class="detail">
                        <div class="label">Resource:</div>
                        <div class="value">${tx.resource}</div>
                    </div>
                    <div class="detail">
                        <div class="label">Network:</div>
                        <div class="value">${tx.networkId}</div>
                    </div>
                </div>
            </div>
        `).join('')}
    </div>
</body>
</html>`;
        
        fs.writeFileSync('x402-block-explorer.html', html);
        return 'x402-block-explorer.html';
    }
}

// RPC Helper
async function rpcCall(method, params = []) {
    const response = await axios.post(RPC_URL, {
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: Math.floor(Math.random() * 1000)
    });
    
    if (response.data.error) {
        throw new Error(`RPC Error: ${response.data.error.message}`);
    }
    
    return response.data.result;
}

// Demo function to test the system
async function demonstrateX402System() {
    console.log('🚀 X402 Transaction System Demo\n');
    
    const x402System = new X402TransactionSystem();
    
    try {
        // Create a test payment
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const FROM = wallet.address;
        const TO = '0x36459Eb21a00f9c068d9518830C5937c6e6CB301';
        const USDT_CONTRACT = '0xfE62874b9E469abBF643fFb78B1a13988d2531DF';
        const AMOUNT = '0x5f5e100';
        
        console.log('💰 Creating X402 payment...');
        
        const now = Math.floor(Date.now() / 1000);
        const validAfter = now;
        const validBefore = now + 300;
        const nonceBytes = ethers.randomBytes(32);
        const nonce = '0x' + Buffer.from(nonceBytes).toString('hex');
        
        const message = `x402-payment:${FROM}:${TO}:${AMOUNT}:${validAfter}:${validBefore}:${nonce}:${USDT_CONTRACT}:${CHAIN_ID}`;
        const signature = await wallet.signMessage(message);
        
        const requirements = {
            scheme: 'exact',
            network: 'splendor',
            maxAmountRequired: AMOUNT,
            resource: 'demo-payment',
            description: 'X402 System Demo Payment',
            mimeType: 'application/json',
            payTo: TO,
            maxTimeoutSeconds: 300,
            asset: USDT_CONTRACT,
        };
        
        const paymentPayload = {
            x402Version: 1,
            scheme: 'exact',
            network: 'splendor',
            payload: {
                from: FROM,
                to: TO,
                value: AMOUNT,
                validAfter,
                validBefore,
                nonce,
                asset: USDT_CONTRACT,
                signature,
            },
            resource: requirements.resource,
            description: requirements.description
        };
        
        // Verify and settle
        console.log('🔍 Verifying payment...');
        const verifyResult = await rpcCall('x402_verify', [requirements, paymentPayload]);
        
        console.log('💸 Settling payment...');
        const settleResult = await rpcCall('x402_settle', [requirements, paymentPayload]);
        
        if (settleResult.success) {
            // Record in our system
            console.log('📝 Recording transaction in X402 system...');
            const txRecord = x402System.recordTransaction(
                settleResult.txHash,
                paymentPayload,
                verifyResult,
                settleResult
            );
            
            console.log('✅ Transaction recorded successfully!');
            console.log(`   Hash: ${txRecord.hash}`);
            console.log(`   Status: ${txRecord.status}`);
            
            // Demonstrate retrieval methods
            console.log('\n🔍 Testing X402 transaction retrieval methods...');
            
            // Get transaction
            const retrievedTx = x402System.getTransaction(settleResult.txHash);
            console.log(`✅ getTransaction: ${retrievedTx ? 'Found' : 'Not found'}`);
            
            // Get receipt
            const receipt = x402System.getTransactionReceipt(settleResult.txHash);
            console.log(`✅ getTransactionReceipt: ${receipt ? 'Generated' : 'Failed'}`);
            
            // Get block explorer data
            const explorerData = x402System.generateBlockExplorerData(settleResult.txHash);
            console.log(`✅ Block explorer data: ${explorerData ? 'Generated' : 'Failed'}`);
            
            // Generate block explorer files
            console.log('\n📊 Generating block explorer files...');
            const exportData = x402System.exportForBlockExplorer();
            console.log(`✅ Exported ${exportData.totalTransactions} transactions to x402-block-explorer-data.json`);
            
            const htmlFile = x402System.generateBlockExplorerHTML();
            console.log(`✅ Generated block explorer HTML: ${htmlFile}`);
            
            console.log('\n🎉 X402 Transaction System Demo Complete!');
            console.log('\n📋 Available files:');
            console.log('   - x402-transactions.json (transaction database)');
            console.log('   - x402-block-explorer-data.json (API data)');
            console.log('   - x402-block-explorer.html (web interface)');
            
            console.log('\n🌐 To view the block explorer, open x402-block-explorer.html in your browser');
            
        } else {
            console.log('❌ Payment settlement failed');
        }
        
    } catch (error) {
        console.error('❌ Demo failed:', error.message);
    }
}

// CLI interface
if (process.argv[2] === 'demo') {
    demonstrateX402System();
} else if (process.argv[2] === 'get' && process.argv[3]) {
    const x402System = new X402TransactionSystem();
    const tx = x402System.getTransaction(process.argv[3]);
    console.log(tx ? JSON.stringify(tx, null, 2) : 'Transaction not found');
} else if (process.argv[2] === 'receipt' && process.argv[3]) {
    const x402System = new X402TransactionSystem();
    const receipt = x402System.getTransactionReceipt(process.argv[3]);
    console.log(receipt ? JSON.stringify(receipt, null, 2) : 'Receipt not found');
} else if (process.argv[2] === 'export') {
    const x402System = new X402TransactionSystem();
    const data = x402System.exportForBlockExplorer();
    console.log(`Exported ${data.totalTransactions} transactions`);
} else if (process.argv[2] === 'html') {
    const x402System = new X402TransactionSystem();
    const file = x402System.generateBlockExplorerHTML();
    console.log(`Generated: ${file}`);
} else {
    console.log('X402 Transaction System');
    console.log('Usage:');
    console.log('  node x402-transaction-system.js demo          - Run demo');
    console.log('  node x402-transaction-system.js get <hash>    - Get transaction');
    console.log('  node x402-transaction-system.js receipt <hash> - Get receipt');
    console.log('  node x402-transaction-system.js export       - Export data');
    console.log('  node x402-transaction-system.js html         - Generate HTML');
}
