#!/usr/bin/env node

/**
 * Fund the x402 pseudo-sender account with ETH for gas
 */

const axios = require('axios');
const { ethers } = require('ethers');

// Configuration
const RPC_URL = 'http://144.76.98.222:80';
const PSEUDO_SENDER = '0x0000000000000000000000000000000000000402';

// You need to provide a funded account to send ETH from
const FUNDER_PRIVATE_KEY = process.env.FUNDER_PRIVATE_KEY || 'YOUR_PRIVATE_KEY_HERE';
const FUNDING_AMOUNT = '1.0'; // 1 ETH

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

async function fundPseudoSender() {
    console.log('💰 Funding X402 Pseudo-Sender Account\n');
    
    try {
        // Check current balance of pseudo-sender
        console.log('🔍 Checking current pseudo-sender balance...');
        const currentBalance = await rpcCall('eth_getBalance', [PSEUDO_SENDER, 'latest']);
        const currentEth = ethers.formatEther(currentBalance);
        console.log(`Current balance: ${currentEth} ETH`);
        
        if (parseFloat(currentEth) >= 1.0) {
            console.log('✅ Pseudo-sender already has sufficient ETH');
            return;
        }
        
        // Setup funder wallet
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const funderWallet = new ethers.Wallet(FUNDER_PRIVATE_KEY, provider);
        
        console.log(`\n💸 Funding from: ${funderWallet.address}`);
        console.log(`💸 Funding to: ${PSEUDO_SENDER}`);
        console.log(`💸 Amount: ${FUNDING_AMOUNT} ETH`);
        
        // Check funder balance
        const funderBalance = await provider.getBalance(funderWallet.address);
        console.log(`Funder balance: ${ethers.formatEther(funderBalance)} ETH`);
        
        if (funderBalance < ethers.parseEther(FUNDING_AMOUNT)) {
            throw new Error('Funder account has insufficient ETH');
        }
        
        // Send ETH to pseudo-sender
        console.log('\n📤 Sending funding transaction...');
        const tx = await funderWallet.sendTransaction({
            to: PSEUDO_SENDER,
            value: ethers.parseEther(FUNDING_AMOUNT),
            gasLimit: 21000,
            gasPrice: ethers.parseUnits('1', 'gwei')
        });
        
        console.log(`Transaction sent: ${tx.hash}`);
        console.log('⏳ Waiting for confirmation...');
        
        const receipt = await tx.wait();
        console.log(`✅ Transaction confirmed in block: ${receipt.blockNumber}`);
        
        // Check new balance
        const newBalance = await rpcCall('eth_getBalance', [PSEUDO_SENDER, 'latest']);
        const newEth = ethers.formatEther(newBalance);
        console.log(`\n🎉 Pseudo-sender new balance: ${newEth} ETH`);
        
        console.log('\n✅ Pseudo-sender account successfully funded!');
        console.log('X402 transactions should now be processed by miners.');
        
    } catch (error) {
        console.error('❌ Error funding pseudo-sender:', error.message);
        process.exit(1);
    }
}

// Run the funding
fundPseudoSender().catch(console.error);
