#!/usr/bin/env node

/**
 * Test script to verify x402 transaction broadcasting fix
 * This script tests the x402 payment system to ensure transactions are properly broadcasted
 */

import { ethers } from 'ethers';
import axios from 'axios';

// Configuration
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:80';
const PRIVATE_KEY = process.env.PRIVATE_KEY || 'YOUR_PRIVATE_KEY_HERE';
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '2691');

// Test addresses
const FROM = '0xae2094160dDc7A3E4e191863947E9A274aEacd88';
const TO = '0x36459Eb21a00f9c068d9518830C5937c6e6CB301';
const ASSET = '0x0Ead209e30431f75779b8E0c4e82027ADd5A7C2a'; // USDT contract

async function testX402Payment() {
    console.log('🧪 Testing X402 Payment Broadcasting Fix\n');
    
    try {
        // Test 1: Check RPC connectivity
        console.log('📡 Testing RPC connectivity...');
        const response = await axios.post(RPC_URL, {
            jsonrpc: '2.0',
            method: 'eth_blockNumber',
            params: [],
            id: 1
        });
        
        if (response.data.error) {
            throw new Error(`RPC Error: ${response.data.error.message}`);
        }
        
        const blockNumber = parseInt(response.data.result, 16);
        console.log(`✅ Connected to RPC. Current block: ${blockNumber}\n`);
        
        // Test 2: Check x402 support
        console.log('🔍 Checking x402 support...');
        const supportedResponse = await axios.post(RPC_URL, {
            jsonrpc: '2.0',
            method: 'x402_supported',
            params: [],
            id: 2
        });
        
        if (supportedResponse.data.error) {
            console.log('⚠️  x402_supported method not available, continuing anyway...');
        } else {
            console.log('✅ x402 methods are supported');
            console.log('Supported schemes:', JSON.stringify(supportedResponse.data.result, null, 2));
        }
        
        // Test 3: Create and verify x402 payment
        console.log('\n💰 Creating x402 payment...');
        
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
            description: 'Test x402 payment for broadcasting fix',
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
        
        // Test 4: Verify payment
        console.log('\n🔍 Verifying payment...');
        const verifyResponse = await axios.post(RPC_URL, {
            jsonrpc: '2.0',
            method: 'x402_verify',
            params: [requirements, paymentPayload],
            id: 3
        });
        
        if (verifyResponse.data.error) {
            throw new Error(`Verification failed: ${verifyResponse.data.error.message}`);
        }
        
        const verifyResult = verifyResponse.data.result;
        console.log('Verification result:', JSON.stringify(verifyResult, null, 2));
        
        if (!verifyResult.isValid) {
            throw new Error(`Payment verification failed: ${verifyResult.invalidReason}`);
        }
        
        console.log('✅ Payment verification successful');
        
        // Test 5: Settle payment (this will test the broadcasting fix)
        console.log('\n💸 Settling payment (testing broadcast fix)...');
        const settleResponse = await axios.post(RPC_URL, {
            jsonrpc: '2.0',
            method: 'x402_settle',
            params: [requirements, paymentPayload],
            id: 4
        });
        
        if (settleResponse.data.error) {
            throw new Error(`Settlement failed: ${settleResponse.data.error.message}`);
        }
        
        const settleResult = settleResponse.data.result;
        console.log('Settlement result:', JSON.stringify(settleResult, null, 2));
        
        if (!settleResult.success) {
            throw new Error(`Payment settlement failed: ${settleResult.error}`);
        }
        
        console.log('✅ Payment settlement successful');
        console.log(`Transaction hash: ${settleResult.txHash}`);
        
        // Test 6: Monitor transaction for broadcasting
        console.log('\n📡 Monitoring transaction broadcasting...');
        const txHash = settleResult.txHash;
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds
        
        while (attempts < maxAttempts) {
            try {
                const txResponse = await axios.post(RPC_URL, {
                    jsonrpc: '2.0',
                    method: 'eth_getTransactionByHash',
                    params: [txHash],
                    id: 5
                });
                
                if (txResponse.data.result && txResponse.data.result.blockNumber) {
                    console.log(`✅ Transaction mined in block: ${parseInt(txResponse.data.result.blockNumber, 16)}`);
                    console.log('🎉 Broadcasting fix is working correctly!');
                    break;
                } else if (txResponse.data.result) {
                    console.log(`⏳ Transaction pending... (attempt ${attempts + 1}/${maxAttempts})`);
                } else {
                    console.log(`⚠️  Transaction not found in mempool (attempt ${attempts + 1}/${maxAttempts})`);
                }
            } catch (error) {
                console.log(`❌ Error checking transaction: ${error.message}`);
            }
            
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }
        
        if (attempts >= maxAttempts) {
            console.log('⚠️  Transaction monitoring timed out. This may indicate broadcasting issues.');
            console.log('Please check the node logs for x402 broadcast manager activity.');
        }
        
        console.log('\n🏁 Test completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run the test
testX402Payment().catch(console.error);
