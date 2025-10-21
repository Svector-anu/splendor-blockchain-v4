#!/usr/bin/env node

/**
 * Test script to verify x402 transaction retrieval
 * This script tests that x402 transactions can be found with eth.getTransaction
 */

const axios = require('axios');
const { ethers } = require('ethers');

// Configuration
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:80';
const PRIVATE_KEY = process.env.PRIVATE_KEY || 'YOUR_PRIVATE_KEY_HERE';
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '2691');

// Test addresses
const FROM = '0xae2094160dDc7A3E4e191863947E9A274aEacd88';
const TO = '0x36459Eb21a00f9c068d9518830C5937c6e6CB301';
const ASSET = '0x0Ead209e30431f75779b8E0c4e82027ADd5A7C2a'; // USDT contract

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

async function testX402TransactionRetrieval() {
    console.log('🧪 Testing X402 Transaction Retrieval\n');
    
    try {
        // Test 1: Check RPC connectivity
        console.log('📡 Testing RPC connectivity...');
        const blockNumber = await rpcCall('eth_blockNumber');
        console.log(`✅ Connected to RPC. Current block: ${parseInt(blockNumber, 16)}\n`);
        
        // Test 2: Create x402 payment
        console.log('💰 Creating x402 payment...');
        
        const wallet = new ethers.Wallet(PRIVATE_KEY);
        const now = Math.floor(Date.now() / 1000);
        const validAfter = now;
        const validBefore = now + 300; // 5 minutes
        const nonceBytes = ethers.randomBytes(32);
        const nonce = '0x' + Buffer.from(nonceBytes).toString('hex');
        const amount = '0x5f5e100'; // 100 USDT (100 * 10^6)
        
        // Create the payment message
        const message = `x402-payment:${FROM}:${TO}:${amount}:${validAfter}:${validBefore}:${nonce}:${ASSET}:${CHAIN_ID}`;
        const signature = await wallet.signMessage(message);
        
        console.log(`From: ${FROM}`);
        console.log(`To: ${TO}`);
        console.log(`Amount: ${amount} (${parseInt(amount, 16)} wei)`);
        console.log(`Asset: ${ASSET}`);
        console.log(`Nonce: ${nonce}`);
        
        // Prepare payment requirements and payload
        const requirements = {
            scheme: 'exact',
            network: 'splendor',
            maxAmountRequired: amount,
            resource: 'test-payment',
            description: 'Test x402 payment for retrieval',
            mimeType: 'application/json',
            payTo: TO,
            maxTimeoutSeconds: 300,
            asset: ASSET,
        };
        
        const paymentPayload = {
            x402Version: 1,
            scheme: 'exact',
            network: 'splendor',
            payload: {
                from: FROM,
                to: TO,
                value: amount,
                validAfter,
                validBefore,
                nonce,
                asset: ASSET,
                signature,
            },
        };
        
        // Test 3: Settle payment
        console.log('\n💸 Settling payment...');
        const settleResult = await rpcCall('x402_settle', [requirements, paymentPayload]);
        
        if (!settleResult.success) {
            throw new Error(`Payment settlement failed: ${settleResult.error}`);
        }
        
        console.log('✅ Payment settlement successful');
        console.log(`Transaction hash: ${settleResult.txHash}`);
        
        // Test 4: CRITICAL TEST - Check if transaction can be retrieved
        console.log('\n🔍 Testing transaction retrieval...');
        const txHash = settleResult.txHash;
        
        // Wait a moment for transaction to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            const retrievedTx = await rpcCall('eth_getTransactionByHash', [txHash]);
            
            if (retrievedTx === null) {
                console.log('❌ CRITICAL ISSUE: Transaction not found with eth.getTransactionByHash');
                console.log('This indicates the transaction was not properly indexed');
                
                // Check if it's in the transaction pool
                console.log('\n🔍 Checking transaction pool...');
                const poolContent = await rpcCall('txpool_content');
                console.log('Pool content keys:', Object.keys(poolContent));
                
                // Check pending transactions
                if (poolContent.pending) {
                    const pendingAddrs = Object.keys(poolContent.pending);
                    console.log('Pending addresses:', pendingAddrs);
                    
                    for (const addr of pendingAddrs) {
                        const txs = poolContent.pending[addr];
                        console.log(`Pending txs for ${addr}:`, Object.keys(txs));
                    }
                }
                
                return false;
            } else {
                console.log('✅ SUCCESS: Transaction found with eth.getTransactionByHash');
                console.log('Transaction details:');
                console.log(`  Hash: ${retrievedTx.hash}`);
                console.log(`  From: ${retrievedTx.from}`);
                console.log(`  To: ${retrievedTx.to}`);
                console.log(`  Gas: ${retrievedTx.gas}`);
                console.log(`  GasPrice: ${retrievedTx.gasPrice}`);
                console.log(`  Type: ${retrievedTx.type}`);
                console.log(`  BlockNumber: ${retrievedTx.blockNumber}`);
                
                return true;
            }
        } catch (error) {
            console.log(`❌ Error retrieving transaction: ${error.message}`);
            return false;
        }
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        return false;
    }
}

// Run the test
testX402TransactionRetrieval()
    .then((success) => {
        if (success) {
            console.log('\n🎉 X402 transaction retrieval test PASSED!');
            process.exit(0);
        } else {
            console.log('\n❌ X402 transaction retrieval test FAILED!');
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error('\n💥 Test crashed:', error);
        process.exit(1);
    });
