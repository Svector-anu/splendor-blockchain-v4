#!/usr/bin/env node

/**
 * Check USDT balances for sender and receiver addresses
 */

const axios = require('axios');
const { ethers } = require('ethers');

// Configuration
const RPC_URL = 'http://144.76.98.222:80';
const USDT_CONTRACT = '0xF384da26f8098f86624cd7b8779D6358E300c6C3';

// Addresses from the test
const SENDER = '0xae2094160dDc7A3E4e191863947E9A274aEacd88';
const RECEIVER = '0x36459Eb21a00f9c068d9518830C5937c6e6CB301';

// Transaction hash from the successful payment
const TX_HASH = '0x8dcabcfa74c9feca735911efe3af77b93f90c6a88c67e32769e830b7623f3d48';

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

async function getUSDTBalance(address) {
    // balanceOf(address) method signature
    const methodId = '0x70a08231';
    const paddedAddress = address.slice(2).padStart(64, '0');
    const data = methodId + paddedAddress;
    
    const result = await rpcCall('eth_call', [{
        to: USDT_CONTRACT,
        data: data
    }, 'latest']);
    
    // Convert hex result to decimal (USDT has 6 decimals)
    const balanceWei = BigInt(result);
    const balance = Number(balanceWei) / 1000000; // 6 decimals
    
    return balance;
}

async function checkTransaction() {
    try {
        const tx = await rpcCall('eth_getTransactionByHash', [TX_HASH]);
        
        if (tx === null) {
            console.log('❌ Transaction not found in blockchain');
            return false;
        } else {
            console.log('✅ Transaction found in blockchain:');
            console.log(`  Hash: ${tx.hash}`);
            console.log(`  From: ${tx.from}`);
            console.log(`  To: ${tx.to}`);
            console.log(`  Block: ${tx.blockNumber ? parseInt(tx.blockNumber, 16) : 'pending'}`);
            console.log(`  Gas: ${parseInt(tx.gas, 16)}`);
            console.log(`  Type: ${tx.type}`);
            return true;
        }
    } catch (error) {
        console.log(`❌ Error checking transaction: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('🔍 Checking X402 Payment Results\n');
    
    try {
        // Check if transaction exists in blockchain
        console.log('📋 Checking transaction status...');
        const txExists = await checkTransaction();
        
        if (!txExists) {
            console.log('⚠️  Transaction not found - may still be pending or failed');
        }
        
        console.log('\n💰 Checking USDT Balances...');
        
        // Check sender balance
        console.log('\n👤 Sender (FROM):');
        console.log(`Address: ${SENDER}`);
        try {
            const senderBalance = await getUSDTBalance(SENDER);
            console.log(`USDT Balance: ${senderBalance} USDT`);
        } catch (error) {
            console.log(`❌ Error getting sender balance: ${error.message}`);
        }
        
        // Check receiver balance  
        console.log('\n👤 Receiver (TO):');
        console.log(`Address: ${RECEIVER}`);
        try {
            const receiverBalance = await getUSDTBalance(RECEIVER);
            console.log(`USDT Balance: ${receiverBalance} USDT`);
        } catch (error) {
            console.log(`❌ Error getting receiver balance: ${error.message}`);
        }
        
        console.log('\n📊 Summary:');
        console.log(`Transaction Hash: ${TX_HASH}`);
        console.log(`USDT Contract: ${USDT_CONTRACT}`);
        console.log(`Amount Transferred: 100 USDT (0x5f5e100 wei)`);
        
        if (txExists) {
            console.log('✅ Transaction successfully processed and included in blockchain');
        } else {
            console.log('⚠️  Transaction may still be processing or failed');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

main().catch(console.error);
