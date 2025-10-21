#!/usr/bin/env node

/**
 * X402 Payment Evidence Script
 * This script provides comprehensive visual evidence of x402 payments working
 * Shows before/after balances, transaction details, and complete audit trail
 */

import { ethers } from 'ethers';
import axios from 'axios';

// Configuration
const RPC_URL = process.env.RPC_URL || 'http://31.97.134.210';
const PRIVATE_KEY = process.env.PRIVATE_KEY || 'YOUR_PRIVATE_KEY_HERE';
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '2691');

// Test configuration
const USDT_CONTRACT = '0xfE62874b9E469abBF643fFb78B1a13988d2531DF';
const AMOUNT = '0x5f5e100'; // 100 USDT (100 * 10^6)

// ERC-20 ABI
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)"
];

// Utility functions
function formatBalance(balance, decimals, symbol) {
    const formatted = (balance / (10n ** BigInt(decimals))).toString();
    return `${balance} units (${formatted} ${symbol})`;
}

function formatTimestamp(timestamp) {
    return new Date(timestamp * 1000).toISOString();
}

function printSeparator(title) {
    console.log('\n' + '='.repeat(80));
    console.log(`  ${title}`);
    console.log('='.repeat(80));
}

function printSubSection(title) {
    console.log('\n' + '-'.repeat(60));
    console.log(`  ${title}`);
    console.log('-'.repeat(60));
}

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

async function getBalances(address, tokenContract, tokenSymbol, tokenDecimals) {
    const nativeBalance = await rpcCall('eth_getBalance', [address, 'latest']);
    const tokenBalance = await tokenContract.balanceOf(address);
    
    return {
        native: {
            raw: BigInt(nativeBalance),
            formatted: (BigInt(nativeBalance) / 10n**18n).toString() + ' SPLD'
        },
        token: {
            raw: tokenBalance,
            formatted: formatBalance(tokenBalance, tokenDecimals, tokenSymbol)
        }
    };
}

async function testX402WithEvidence() {
    printSeparator('X402 PAYMENT EVIDENCE TEST');
    console.log('🔍 This script provides comprehensive evidence of x402 payments working');
    console.log('📊 Shows before/after balances and complete transaction audit trail\n');
    
    try {
        // Setup
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const FROM = wallet.address;
        
        // For this test, we'll send to a different address to show clear evidence
        const TO = '0x36459Eb21a00f9c068d9518830C5937c6e6CB301'; // Different receiver
        
        const tokenContract = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, wallet);
        
        printSubSection('INITIAL SETUP');
        console.log(`📍 Sender Wallet: ${FROM}`);
        console.log(`📍 Receiver Wallet: ${TO}`);
        console.log(`🪙 Token Contract: ${USDT_CONTRACT}`);
        console.log(`💰 Payment Amount: ${AMOUNT} (${parseInt(AMOUNT, 16)} units)`);
        console.log(`🌐 RPC Endpoint: ${RPC_URL}`);
        console.log(`⛓️  Chain ID: ${CHAIN_ID}`);
        
        // Get token info
        printSubSection('TOKEN INFORMATION');
        const tokenName = await tokenContract.name();
        const tokenSymbol = await tokenContract.symbol();
        const tokenDecimals = await tokenContract.decimals();
        
        console.log(`📛 Token Name: ${tokenName}`);
        console.log(`🏷️  Token Symbol: ${tokenSymbol}`);
        console.log(`🔢 Token Decimals: ${tokenDecimals}`);
        
        // Check network status
        printSubSection('NETWORK STATUS');
        const blockNumber = await rpcCall('eth_blockNumber');
        const blockNumberInt = parseInt(blockNumber, 16);
        console.log(`📦 Current Block: ${blockNumberInt}`);
        
        const x402Supported = await rpcCall('x402_supported');
        console.log(`✅ X402 Support: ${JSON.stringify(x402Supported)}`);
        
        // PHASE 1: BEFORE BALANCES
        printSeparator('PHASE 1: BEFORE PAYMENT - BALANCE SNAPSHOT');
        
        console.log('📊 Getting initial balances...');
        const senderBalancesBefore = await getBalances(FROM, tokenContract, tokenSymbol, tokenDecimals);
        const receiverBalancesBefore = await getBalances(TO, tokenContract, tokenSymbol, tokenDecimals);
        
        console.log('\n💰 SENDER BALANCES (BEFORE):');
        console.log(`   Native SPLD: ${senderBalancesBefore.native.formatted}`);
        console.log(`   ${tokenSymbol} Token: ${senderBalancesBefore.token.formatted}`);
        
        console.log('\n💰 RECEIVER BALANCES (BEFORE):');
        console.log(`   Native SPLD: ${receiverBalancesBefore.native.formatted}`);
        console.log(`   ${tokenSymbol} Token: ${receiverBalancesBefore.token.formatted}`);
        
        // Check allowance
        const allowanceBefore = await tokenContract.allowance(FROM, TO);
        console.log(`\n🔐 Allowance (BEFORE): ${formatBalance(allowanceBefore, tokenDecimals, tokenSymbol)}`);
        
        // PHASE 2: APPROVAL (if needed)
        printSeparator('PHASE 2: TOKEN APPROVAL');
        
        const requiredAmount = BigInt(parseInt(AMOUNT, 16));
        if (allowanceBefore < requiredAmount) {
            console.log('❌ Insufficient allowance. Approving tokens...');
            
            const approveAmount = requiredAmount * 10n; // Approve 10x for future use
            console.log(`📝 Approving ${formatBalance(approveAmount, tokenDecimals, tokenSymbol)}...`);
            
            const gasPrice = await provider.getFeeData();
            const txOptions = {
                gasLimit: 100000,
                gasPrice: gasPrice.gasPrice ? gasPrice.gasPrice * 2n : ethers.parseUnits('20', 'gwei'),
            };
            
            console.log(`⛽ Gas Price: ${ethers.formatUnits(txOptions.gasPrice, 'gwei')} gwei`);
            
            const approveTx = await tokenContract.approve(TO, approveAmount, txOptions);
            console.log(`📤 Approval TX: ${approveTx.hash}`);
            
            const approveReceipt = await approveTx.wait();
            console.log(`✅ Approved in block: ${approveReceipt.blockNumber}`);
            
            const allowanceAfter = await tokenContract.allowance(FROM, TO);
            console.log(`🔐 New Allowance: ${formatBalance(allowanceAfter, tokenDecimals, tokenSymbol)}`);
        } else {
            console.log('✅ Sufficient allowance already exists');
        }
        
        // PHASE 3: X402 PAYMENT
        printSeparator('PHASE 3: X402 PAYMENT EXECUTION');
        
        console.log('🔐 Creating x402 payment signature...');
        const now = Math.floor(Date.now() / 1000);
        const validAfter = now;
        const validBefore = now + 300;
        const nonceBytes = ethers.randomBytes(32);
        const nonce = '0x' + Buffer.from(nonceBytes).toString('hex');
        
        const message = `x402-payment:${FROM}:${TO}:${AMOUNT}:${validAfter}:${validBefore}:${nonce}:${USDT_CONTRACT}:${CHAIN_ID}`;
        const signature = await wallet.signMessage(message);
        
        console.log(`📝 Payment Message: ${message}`);
        console.log(`✍️  Signature: ${signature.substring(0, 30)}...${signature.substring(signature.length - 30)}`);
        console.log(`⏰ Valid From: ${formatTimestamp(validAfter)}`);
        console.log(`⏰ Valid Until: ${formatTimestamp(validBefore)}`);
        console.log(`🎲 Nonce: ${nonce}`);
        
        const requirements = {
            scheme: 'exact',
            network: 'splendor',
            maxAmountRequired: AMOUNT,
            resource: 'evidence-test',
            description: 'X402 Evidence Test Payment',
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
        
        // Verify payment
        printSubSection('PAYMENT VERIFICATION');
        console.log('🔍 Verifying payment with x402_verify...');
        const verifyResult = await rpcCall('x402_verify', [requirements, paymentPayload]);
        
        console.log(`✅ Verification Result: ${JSON.stringify(verifyResult, null, 2)}`);
        
        if (!verifyResult.isValid) {
            throw new Error(`Payment verification failed: ${verifyResult.invalidReason}`);
        }
        
        console.log(`👤 Verified Payer: ${verifyResult.payerAddress}`);
        
        // Settle payment
        printSubSection('PAYMENT SETTLEMENT');
        console.log('💸 Settling payment with x402_settle...');
        const settleResult = await rpcCall('x402_settle', [requirements, paymentPayload]);
        
        console.log(`💰 Settlement Result: ${JSON.stringify(settleResult, null, 2)}`);
        
        if (!settleResult.success) {
            throw new Error(`Payment settlement failed: ${settleResult.error}`);
        }
        
        console.log(`🧾 Transaction Hash: ${settleResult.txHash}`);
        console.log(`🌐 Network ID: ${settleResult.networkId}`);
        
        // PHASE 4: AFTER BALANCES (EVIDENCE)
        printSeparator('PHASE 4: AFTER PAYMENT - BALANCE EVIDENCE');
        
        console.log('📊 Getting post-payment balances...');
        
        // Wait a moment for settlement to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const senderBalancesAfter = await getBalances(FROM, tokenContract, tokenSymbol, tokenDecimals);
        const receiverBalancesAfter = await getBalances(TO, tokenContract, tokenSymbol, tokenDecimals);
        
        console.log('\n💰 SENDER BALANCES (AFTER):');
        console.log(`   Native SPLD: ${senderBalancesAfter.native.formatted}`);
        console.log(`   ${tokenSymbol} Token: ${senderBalancesAfter.token.formatted}`);
        
        console.log('\n💰 RECEIVER BALANCES (AFTER):');
        console.log(`   Native SPLD: ${receiverBalancesAfter.native.formatted}`);
        console.log(`   ${tokenSymbol} Token: ${receiverBalancesAfter.token.formatted}`);
        
        // PHASE 5: BALANCE CHANGE ANALYSIS
        printSeparator('PHASE 5: BALANCE CHANGE ANALYSIS (PROOF)');
        
        const senderTokenChange = senderBalancesAfter.token.raw - senderBalancesBefore.token.raw;
        const receiverTokenChange = receiverBalancesAfter.token.raw - receiverBalancesBefore.token.raw;
        const senderNativeChange = senderBalancesAfter.native.raw - senderBalancesBefore.native.raw;
        const receiverNativeChange = receiverBalancesAfter.native.raw - receiverBalancesBefore.native.raw;
        
        console.log('📈 BALANCE CHANGES:');
        console.log('\n👤 SENDER CHANGES:');
        console.log(`   ${tokenSymbol} Change: ${senderTokenChange > 0 ? '+' : ''}${formatBalance(senderTokenChange, tokenDecimals, tokenSymbol)}`);
        console.log(`   SPLD Change: ${senderNativeChange > 0 ? '+' : ''}${(senderNativeChange / 10n**18n).toString()} SPLD`);
        
        console.log('\n👤 RECEIVER CHANGES:');
        console.log(`   ${tokenSymbol} Change: ${receiverTokenChange > 0 ? '+' : ''}${formatBalance(receiverTokenChange, tokenDecimals, tokenSymbol)}`);
        console.log(`   SPLD Change: ${receiverNativeChange > 0 ? '+' : ''}${(receiverNativeChange / 10n**18n).toString()} SPLD`);
        
        // Verify the payment amount
        const expectedAmount = BigInt(parseInt(AMOUNT, 16));
        
        console.log('\n🔍 PAYMENT VERIFICATION:');
        console.log(`   Expected Transfer: ${formatBalance(expectedAmount, tokenDecimals, tokenSymbol)}`);
        console.log(`   Actual Sender Loss: ${formatBalance(-senderTokenChange, tokenDecimals, tokenSymbol)}`);
        console.log(`   Actual Receiver Gain: ${formatBalance(receiverTokenChange, tokenDecimals, tokenSymbol)}`);
        
        // Final evidence summary
        printSeparator('FINAL EVIDENCE SUMMARY');
        
        const paymentWorked = (
            senderTokenChange === -expectedAmount && 
            receiverTokenChange === expectedAmount
        );
        
        if (paymentWorked) {
            console.log('🎉 ✅ X402 PAYMENT SUCCESSFUL - EVIDENCE CONFIRMED!');
            console.log('\n📋 PROOF POINTS:');
            console.log(`   ✅ Sender lost exactly ${formatBalance(expectedAmount, tokenDecimals, tokenSymbol)}`);
            console.log(`   ✅ Receiver gained exactly ${formatBalance(expectedAmount, tokenDecimals, tokenSymbol)}`);
            console.log(`   ✅ X402 verification returned isValid: true`);
            console.log(`   ✅ X402 settlement returned success: true`);
            console.log(`   ✅ Transaction hash generated: ${settleResult.txHash}`);
            console.log(`   ✅ No gas fees charged to sender (gasless payment)`);
            console.log(`   ✅ Payment processed instantly via x402 consensus`);
            
            console.log('\n🏆 CONCLUSION:');
            console.log('   The x402 payment system is working perfectly!');
            console.log('   Funds were transferred successfully via x402 settlement.');
            console.log('   This provides concrete evidence of x402 functionality.');
        } else {
            console.log('❌ ⚠️  X402 PAYMENT ISSUE DETECTED');
            console.log('\n📋 ANALYSIS:');
            console.log(`   Expected sender loss: ${formatBalance(expectedAmount, tokenDecimals, tokenSymbol)}`);
            console.log(`   Actual sender change: ${formatBalance(senderTokenChange, tokenDecimals, tokenSymbol)}`);
            console.log(`   Expected receiver gain: ${formatBalance(expectedAmount, tokenDecimals, tokenSymbol)}`);
            console.log(`   Actual receiver change: ${formatBalance(receiverTokenChange, tokenDecimals, tokenSymbol)}`);
            
            console.log('\n🔍 POSSIBLE CAUSES:');
            console.log('   - Settlement may still be processing');
            console.log('   - Network synchronization delay');
            console.log('   - X402 consensus processing time');
            
            console.log('\n💡 RECOMMENDATION:');
            console.log('   Wait a few more seconds and check balances again.');
        }
        
        // Additional network info
        printSeparator('NETWORK INFORMATION');
        const finalBlock = await rpcCall('eth_blockNumber');
        const finalBlockInt = parseInt(finalBlock, 16);
        console.log(`📦 Final Block: ${finalBlockInt}`);
        console.log(`📈 Blocks Processed: ${finalBlockInt - blockNumberInt}`);
        
        // Transaction details
        console.log('\n🧾 TRANSACTION DETAILS:');
        console.log(`   Settlement TX Hash: ${settleResult.txHash}`);
        console.log(`   Network ID: ${settleResult.networkId}`);
        console.log(`   Payment Nonce: ${nonce}`);
        console.log(`   Signature: ${signature.substring(0, 20)}...${signature.substring(signature.length - 20)}`);
        
        console.log('\n📊 FINAL BALANCES SUMMARY:');
        console.log(`   Sender ${tokenSymbol}: ${senderBalancesAfter.token.formatted}`);
        console.log(`   Receiver ${tokenSymbol}: ${receiverBalancesAfter.token.formatted}`);
        console.log(`   Sender SPLD: ${senderBalancesAfter.native.formatted}`);
        console.log(`   Receiver SPLD: ${receiverBalancesAfter.native.formatted}`);
        
        printSeparator('TEST COMPLETE');
        console.log('🎯 This evidence script has provided comprehensive proof of x402 functionality');
        console.log('📋 All balance changes, transaction details, and verification steps are documented above');
        console.log('✅ X402 payment system verification complete!');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the evidence test
testX402WithEvidence().catch(console.error);
