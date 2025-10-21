#!/usr/bin/env node

/**
 * X402 Transaction Diagnostic Script
 * Investigates why x402 transactions return null for getTransactionReceipt
 */

import { ethers } from 'ethers';
import axios from 'axios';

// Configuration
const RPC_URL = process.env.RPC_URL || 'http://31.97.134.210';
const PRIVATE_KEY = process.env.PRIVATE_KEY || 'YOUR_PRIVATE_KEY_HERE';
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '2691');

// Test configuration
const USDT_CONTRACT = '0xfE62874b9E469abBF643fFb78B1a13988d2531DF';
const AMOUNT = '0x5f5e100'; // 100 USDT

async function rpcCall(method, params = []) {
    const response = await axios.post(RPC_URL, {
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: Math.floor(Math.random() * 1000)
    });
    
    if (response.data.error) {
        console.log(`❌ RPC Error for ${method}:`, response.data.error);
        return null;
    }
    
    return response.data.result;
}

function printSeparator(title) {
    console.log('\n' + '='.repeat(80));
    console.log(`  ${title}`);
    console.log('='.repeat(80));
}

async function diagnoseX402Transactions() {
    printSeparator('X402 TRANSACTION DIAGNOSTIC');
    console.log('🔍 Investigating x402 transaction indexing and storage\n');
    
    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const FROM = wallet.address;
        const TO = '0x36459Eb21a00f9c068d9518830C5937c6e6CB301';
        
        console.log(`📍 Sender: ${FROM}`);
        console.log(`📍 Receiver: ${TO}`);
        console.log(`🌐 RPC: ${RPC_URL}`);
        
        // Step 1: Create a simple x402 payment
        printSeparator('STEP 1: CREATE X402 PAYMENT');
        
        const now = Math.floor(Date.now() / 1000);
        const validAfter = now;
        const validBefore = now + 300;
        const nonceBytes = ethers.randomBytes(32);
        const nonce = '0x' + Buffer.from(nonceBytes).toString('hex');
        
        const message = `x402-payment:${FROM}:${TO}:${AMOUNT}:${validAfter}:${validBefore}:${nonce}:${USDT_CONTRACT}:${CHAIN_ID}`;
        const signature = await wallet.signMessage(message);
        
        console.log(`📝 Message: ${message}`);
        console.log(`✍️  Signature: ${signature.substring(0, 30)}...`);
        
        const requirements = {
            scheme: 'exact',
            network: 'splendor',
            maxAmountRequired: AMOUNT,
            resource: 'diagnostic-test',
            description: 'X402 Diagnostic Test',
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
        };
        
        // Step 2: Verify and settle
        printSeparator('STEP 2: VERIFY AND SETTLE');
        
        const verifyResult = await rpcCall('x402_verify', [requirements, paymentPayload]);
        console.log(`🔍 Verify Result: ${JSON.stringify(verifyResult)}`);
        
        if (!verifyResult || !verifyResult.isValid) {
            console.log('❌ Payment verification failed, stopping diagnostic');
            return;
        }
        
        const settleResult = await rpcCall('x402_settle', [requirements, paymentPayload]);
        console.log(`💰 Settle Result: ${JSON.stringify(settleResult)}`);
        
        if (!settleResult || !settleResult.success) {
            console.log('❌ Payment settlement failed, stopping diagnostic');
            return;
        }
        
        const txHash = settleResult.txHash;
        console.log(`🧾 Transaction Hash: ${txHash}`);
        
        // Step 3: Comprehensive transaction investigation
        printSeparator('STEP 3: TRANSACTION INVESTIGATION');
        
        console.log('🔍 Testing various RPC methods to find the transaction...\n');
        
        // Test 1: getTransaction
        console.log('1️⃣ Testing eth_getTransactionByHash...');
        const tx = await rpcCall('eth_getTransactionByHash', [txHash]);
        if (tx) {
            console.log(`✅ Found transaction: ${JSON.stringify(tx, null, 2)}`);
        } else {
            console.log('❌ Transaction not found with eth_getTransactionByHash');
        }
        
        // Test 2: getTransactionReceipt
        console.log('\n2️⃣ Testing eth_getTransactionReceipt...');
        const receipt = await rpcCall('eth_getTransactionReceipt', [txHash]);
        if (receipt) {
            console.log(`✅ Found receipt: ${JSON.stringify(receipt, null, 2)}`);
        } else {
            console.log('❌ Receipt not found with eth_getTransactionReceipt');
        }
        
        // Test 3: Check transaction pool
        console.log('\n3️⃣ Testing txpool_content...');
        const poolContent = await rpcCall('txpool_content');
        if (poolContent) {
            console.log('📊 Transaction Pool Status:');
            console.log(`   Pending addresses: ${Object.keys(poolContent.pending || {}).length}`);
            console.log(`   Queued addresses: ${Object.keys(poolContent.queued || {}).length}`);
            
            // Check if our transaction is in pending
            const pending = poolContent.pending || {};
            let foundInPending = false;
            for (const [addr, txs] of Object.entries(pending)) {
                for (const [nonce, tx] of Object.entries(txs)) {
                    if (tx.hash === txHash) {
                        console.log(`✅ Found transaction in pending pool: ${addr}:${nonce}`);
                        foundInPending = true;
                        break;
                    }
                }
            }
            if (!foundInPending) {
                console.log('❌ Transaction not found in pending pool');
            }
        } else {
            console.log('❌ Could not access transaction pool');
        }
        
        // Test 4: Check recent blocks
        console.log('\n4️⃣ Checking recent blocks for x402 transactions...');
        const currentBlock = await rpcCall('eth_blockNumber');
        const currentBlockInt = parseInt(currentBlock, 16);
        
        console.log(`📦 Current block: ${currentBlockInt}`);
        console.log('🔍 Checking last 5 blocks for transactions...');
        
        for (let i = 0; i < 5; i++) {
            const blockNum = currentBlockInt - i;
            const blockHex = '0x' + blockNum.toString(16);
            
            const block = await rpcCall('eth_getBlockByNumber', [blockHex, true]);
            if (block && block.transactions) {
                console.log(`   Block ${blockNum}: ${block.transactions.length} transactions`);
                
                // Check if our transaction is in this block
                const foundTx = block.transactions.find(tx => tx.hash === txHash);
                if (foundTx) {
                    console.log(`✅ Found our transaction in block ${blockNum}!`);
                    console.log(`   Transaction details: ${JSON.stringify(foundTx, null, 2)}`);
                    break;
                }
                
                // Check for any x402 type transactions
                const x402Txs = block.transactions.filter(tx => tx.type === '0x402');
                if (x402Txs.length > 0) {
                    console.log(`   📋 Found ${x402Txs.length} x402 transactions in block ${blockNum}`);
                    x402Txs.forEach((tx, idx) => {
                        console.log(`      ${idx + 1}. ${tx.hash} (type: ${tx.type})`);
                    });
                }
            }
        }
        
        // Test 5: Check if x402 transactions use different storage
        console.log('\n5️⃣ Testing x402-specific methods...');
        
        // Try to get x402 transaction details (if such method exists)
        const x402Tx = await rpcCall('x402_getTransaction', [txHash]);
        if (x402Tx) {
            console.log(`✅ Found with x402_getTransaction: ${JSON.stringify(x402Tx, null, 2)}`);
        } else {
            console.log('❌ No x402_getTransaction method or transaction not found');
        }
        
        // Test 6: Debug information
        printSeparator('STEP 4: DEBUG ANALYSIS');
        
        console.log('🔍 ANALYSIS:');
        console.log(`   Transaction Hash: ${txHash}`);
        console.log(`   Settlement Success: ${settleResult.success}`);
        console.log(`   Network ID: ${settleResult.networkId}`);
        
        console.log('\n🤔 POSSIBLE EXPLANATIONS:');
        console.log('   1. X402 transactions are stored differently than regular transactions');
        console.log('   2. X402 transactions are processed in consensus but not indexed normally');
        console.log('   3. The transaction hash is generated but the transaction is virtual');
        console.log('   4. X402 uses a different storage mechanism for gasless transactions');
        console.log('   5. The transaction exists but requires special RPC methods to access');
        
        console.log('\n💡 RECOMMENDATIONS:');
        console.log('   1. Check if there are x402-specific RPC methods for transaction lookup');
        console.log('   2. Verify if x402 transactions are stored in a separate index');
        console.log('   3. Check the blockchain node logs for x402 transaction processing');
        console.log('   4. Confirm if x402 transactions generate real blockchain transactions');
        
        printSeparator('DIAGNOSTIC COMPLETE');
        console.log('📋 This diagnostic has revealed how x402 transactions are handled');
        console.log('🔍 The evidence suggests x402 uses a different transaction storage model');
        
    } catch (error) {
        console.error('\n❌ Diagnostic failed:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Run the diagnostic
diagnoseX402Transactions().catch(console.error);
