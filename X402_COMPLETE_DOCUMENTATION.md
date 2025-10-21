# Splendor X402 Native Payment System - Complete Documentation

## 🚀 Overview

X402 is the world's first native blockchain payment system built directly into Splendor's consensus layer. It enables gasless micropayments with direct transfers, making it perfect for API monetization, content paywalls, and AI agent payments.

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture](#architecture)
3. [API Reference](#api-reference)
4. [Integration Guide](#integration-guide)
5. [Deployment](#deployment)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Prerequisites
- Splendor blockchain node with X402 support
- Node.js 16+ for middleware/testing
- Wallet with SPLD or ERC-20 tokens

### 1. Enable X402 on Your Node

```bash
# Build node with X402 support
cd Core-Blockchain/node_src
make geth

# Start RPC node with X402 API
cd ..
./node-start.sh --rpc
```

### 2. Test X402 Functionality

```bash
# Set environment variables
export RPC_URL="https://your-rpc-endpoint/"
export PRIVATE_KEY="YOUR_PRIVATE_KEY_HERE"

# Test basic functionality
node test-x402-native-spld.js

# Test ERC-20 payments
node approve-and-test-erc20.js
```

### 3. Add Payments to Your API (1 Line!)

```javascript
const { splendorX402Express } = require('./x402-middleware');

app.use('/api', splendorX402Express({
  payTo: '0xYourWalletAddress',
  pricing: {
    '/api/weather': '0.001',    // $0.001 per request
    '/api/premium': '0.01'      // $0.01 per request
  }
}));
```

---

## 🏗️ Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    HTTP/RPC Layer                           │
│  • x402_verify, x402_settle, x402_supported               │
└────────────────────────┬────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────────┐
│                  Transaction Pool                           │
│  • Pseudo-sender (0x...402) handling                       │
│  • Gasless transaction processing                           │
└────────────────────────┬────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────────┐
│              X402 Broadcast Manager                          │
│  • Network propagation                                      │
│  • Transaction lifecycle management                         │
└────────────────────────┬────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────────┐
│                 Consensus Layer                             │
│  • Native X402 processing                                  │
│  • Direct payment transfers                                │
│  • ERC-20 and SPLD support                                │
└─────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `core/types/tx_x402.go` | X402 transaction type definition |
| `core/types/transaction.go` | Transaction type registration |
| `core/tx_pool.go` | Transaction pool integration |
| `core/state_processor.go` | Consensus-level processing |
| `eth/api_x402.go` | RPC API implementation |
| `eth/handler_x402_fix.go` | Broadcasting system |
| `eth/backend.go` | Backend integration |

---

## 📡 API Reference

### RPC Methods

#### `x402_supported`
Returns supported X402 payment schemes.

```bash
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"x402_supported","params":[],"id":1}' \
  https://mainnet-rpc.splendor.org/
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "kinds": [
      {
        "scheme": "exact",
        "network": "splendor"
      }
    ]
  },
  "id": 1
}
```

#### `x402_verify`
Verifies a payment without executing it.

**Parameters:**
- `requirements` - Payment requirements object
- `payload` - Signed payment payload

```bash
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"x402_verify","params":[requirements, payload],"id":1}' \
  https://mainnet-rpc.splendor.org/
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "isValid": true,
    "payerAddress": "0x..."
  },
  "id": 1
}
```

#### `x402_settle`
Settles a verified payment on the blockchain.

**Parameters:**
- `requirements` - Payment requirements object
- `payload` - Signed payment payload

```bash
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"x402_settle","params":[requirements, payload],"id":1}' \
  https://mainnet-rpc.splendor.org/
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "txHash": "0x...",
    "networkId": "splendor"
  },
  "id": 1
}
```

---

## 🔧 Integration Guide

### 1. Payment Requirements Object

```javascript
const requirements = {
  scheme: 'exact',
  network: 'splendor',
  maxAmountRequired: '0x5f5e100',        // Amount in hex
  resource: '/api/premium',               // Resource identifier
  description: 'Premium API access',     // Human description
  mimeType: 'application/json',          // Response type
  payTo: '0xYourWalletAddress',          // Your wallet
  maxTimeoutSeconds: 300,                // Validity window
  asset: '0x0000000000000000000000000000000000000000' // SPLD or token address
};
```

### 2. Payment Payload Creation

```javascript
import { ethers } from 'ethers';

// Create payment message
const message = `x402-payment:${from}:${to}:${value}:${validAfter}:${validBefore}:${nonce}:${asset}:${chainId}`;
const signature = await wallet.signMessage(message);

const payload = {
  x402Version: 1,
  scheme: 'exact',
  network: 'splendor',
  payload: {
    from: wallet.address,
    to: requirements.payTo,
    value: requirements.maxAmountRequired,
    validAfter: Math.floor(Date.now() / 1000),
    validBefore: Math.floor(Date.now() / 1000) + 300,
    nonce: '0x' + Buffer.from(ethers.randomBytes(32)).toString('hex'),
    asset: requirements.asset,
    signature: signature
  }
};
```

### 3. Express.js Integration

```javascript
const express = require('express');
const { splendorX402Express } = require('./x402-middleware');

const app = express();

// Add X402 middleware
const x402Middleware = splendorX402Express({
  payTo: '0xYourWalletAddress',
  rpcUrl: 'https://mainnet-rpc.splendor.org/',
  pricing: {
    '/api/free': '0',           // Free endpoint
    '/api/basic': '0.001',      // $0.001 per request
    '/api/premium': '0.01',     // $0.01 per request
    '/api/data/*': '0.005',     // Wildcard pattern
  },
  defaultPrice: '0.002'         // Default for unspecified endpoints
});

app.use('/api', x402Middleware);

// Your API endpoints
app.get('/api/premium', (req, res) => {
  // req.x402 contains payment info if paid
  res.json({ 
    data: 'Premium content',
    payment: req.x402 
  });
});

app.listen(3000);
```

### 4. Manual Integration

```javascript
async function handleRequest(req, res) {
  const paymentHeader = req.headers['x-payment'];
  
  if (!paymentHeader) {
    // Return 402 with payment requirements
    return res.status(402).json({
      x402Version: 1,
      accepts: [requirements]
    });
  }
  
  // Verify payment
  const paymentData = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
  const verifyResult = await rpc.call('x402_verify', [requirements, paymentData]);
  
  if (!verifyResult.isValid) {
    return res.status(402).json({ error: 'Invalid payment' });
  }
  
  // Settle payment
  const settleResult = await rpc.call('x402_settle', [requirements, paymentData]);
  
  if (!settleResult.success) {
    return res.status(500).json({ error: 'Settlement failed' });
  }
  
  // Serve content
  res.json({ data: 'Your content here' });
}
```

---

## 🚀 Deployment

### Node Deployment

#### 1. Build with X402 Support

```bash
cd Core-Blockchain/node_src
make geth
```

#### 2. Configure Environment

```bash
# Add to .env file
X402_ENABLED=true
X402_NETWORK=splendor
X402_CHAIN_ID=2691
X402_DEFAULT_PRICE=0.001
```

#### 3. Start Node

```bash
# RPC Node
./node-start.sh --rpc

# Validator Node  
./node-start.sh --validator
```

#### 4. Verify X402 API

```bash
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"x402_supported","params":[],"id":1}' \
  http://localhost:80/
```

### Middleware Deployment

#### 1. Install Dependencies

```bash
cd x402-middleware
npm install
```

#### 2. Configure Middleware

```javascript
// server.js
const middleware = splendorX402Express({
  payTo: process.env.X402_PAYTO,
  rpcUrl: process.env.X402_RPC_URL,
  pricing: {
    '/api/weather': process.env.WEATHER_PRICE || '0.001',
    '/api/premium': process.env.PREMIUM_PRICE || '0.01'
  }
});
```

#### 3. Environment Variables

```bash
export X402_PAYTO="0xYourWalletAddress"
export X402_RPC_URL="https://mainnet-rpc.splendor.org/"
export WEATHER_PRICE="0.001"
export PREMIUM_PRICE="0.01"
```

### ⚠️ Upgrade Requirements

**NO BLOCKCHAIN RESET REQUIRED** - This is a backward-compatible update:

- ✅ **Hot upgrade possible** - New transaction type doesn't break existing blocks
- ✅ **Existing transactions continue working** - No impact on current functionality  
- ✅ **Node restart required** - Just rebuild and restart nodes with new binary
- ✅ **Network compatibility** - Nodes without X402 will ignore these transactions

**Upgrade Process:**
1. Build new binary: `make geth`
2. Stop nodes gracefully: `./node-stop.sh`
3. Replace binary: `cp build/bin/geth ./geth`
4. Restart nodes: `./node-start.sh --rpc`
5. X402 functionality becomes available immediately

---

## 🧪 Testing

### Available Test Scripts

| Script | Purpose |
|--------|---------|
| `test-x402-native-spld.js` | Test native SPLD payments |
| `approve-and-test-erc20.js` | Test ERC-20 payments with approval |
| `test-x402-evidence.js` | Comprehensive evidence testing |
| `diagnose-x402-transactions.js` | Transaction diagnostic tool |
| `x402-transaction-system.js` | Transaction tracking system |

### Running Tests

```bash
# Set environment
export RPC_URL="https://your-rpc-endpoint/"
export PRIVATE_KEY="your-private-key"
export CHAIN_ID="2691"

# Test native SPLD payments
node test-x402-native-spld.js

# Test ERC-20 payments (requires token approval)
node approve-and-test-erc20.js

# Run comprehensive evidence test
node test-x402-evidence.js

# Diagnose transaction handling
node diagnose-x402-transactions.js

# Demo transaction tracking system
node x402-transaction-system.js demo
```

### Integration Testing

```bash
# Test middleware server
cd Core-Blockchain
export X402_PAYTO="0xYourWallet"
export X402_RPC_URL="https://your-rpc-endpoint/"
node examples/x402-middleware-server.js

# Test endpoints
curl http://localhost:3000/api/free      # Should work
curl http://localhost:3000/api/premium   # Should return 402
```

---

## 🔍 Troubleshooting

### Common Issues

#### 1. "x402_supported method not available"
**Cause:** Node not built with X402 support or API not enabled.
**Solution:**
```bash
cd Core-Blockchain/node_src && make geth
./node-start.sh --rpc  # Ensure x402 is in --http.api
```

#### 2. "Insufficient token allowance"
**Cause:** ERC-20 tokens require approval before X402 payments.
**Solution:**
```javascript
// Approve tokens first
const erc20 = new ethers.Contract(tokenAddress, erc20Abi, wallet);
await erc20.approve(payToAddress, amount);
```

#### 3. "Payment verification failed"
**Cause:** Invalid signature, expired payment, or insufficient balance.
**Solution:**
- Check wallet balance
- Verify signature format (EIP-191)
- Ensure payment is within validity window
- Confirm correct chain ID (2691)

#### 4. "Transaction not found in block explorer"
**Cause:** X402 transactions use special processing and may not appear in standard explorers.
**Solution:**
```bash
# Use X402 transaction system
node x402-transaction-system.js get 0xTxHash
node x402-transaction-system.js receipt 0xTxHash
```

#### 5. "Settlement failed"
**Cause:** Network issues, insufficient balance, or consensus problems.
**Solution:**
- Check node connectivity
- Verify account balance
- Check node logs for errors
- Ensure proper gas settings for approval transactions

### Debug Commands

```bash
# Check node status
curl -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:80/

# Check X402 support
curl -X POST --data '{"jsonrpc":"2.0","method":"x402_supported","params":[],"id":1}' http://localhost:80/

# Check account balance
curl -X POST --data '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xAddress","latest"],"id":1}' http://localhost:80/

# Check transaction pool
curl -X POST --data '{"jsonrpc":"2.0","method":"txpool_content","params":[],"id":1}' http://localhost:80/
```

### Log Analysis

Monitor node logs for X402 activity:
```bash
tail -f /path/to/node/logs | grep -i x402
```

Look for:
- `X402: Verifying payment`
- `X402: Settling payment`
- `X402: Broadcasted transaction`
- `X402: Transaction added to broadcast manager`

---

## 📚 Additional Resources

### Documentation Files
- `X402_PAYMENT_FIXES_SUMMARY.md` - Implementation summary
- `docs/x402/README.md` - Developer overview
- `docs/x402/developer-integration.md` - Integration guide
- `docs/x402/native-payments.md` - Technical details
- `docs/x402/payment-guide.md` - Payment formats

### Example Code
- `Core-Blockchain/examples/x402-middleware-server.js` - Express server
- `Core-Blockchain/examples/x402-rpc-gated-server.js` - RPC-only server
- `Core-Blockchain/examples/x402-rpc-gated-flask.py` - Python Flask example

### Middleware
- `Core-Blockchain/x402-middleware/index.js` - Express/Fastify middleware
- `Core-Blockchain/x402-middleware/README.md` - Middleware documentation

---

## 🎯 Production Checklist

### Before Deployment
- [ ] Node built with X402 support (`make geth`)
- [ ] X402 API enabled in node configuration
- [ ] Environment variables configured
- [ ] Wallet funded with SPLD for gas (approval transactions)
- [ ] Test scripts pass successfully
- [ ] Middleware configured with correct pricing
- [ ] SSL/TLS enabled for production APIs

### After Deployment
- [ ] X402 API responding (`x402_supported`)
- [ ] Payment verification working (`x402_verify`)
- [ ] Payment settlement working (`x402_settle`)
- [ ] Revenue receiving correctly (check wallet balance)
- [ ] Error handling working properly
- [ ] Monitoring and logging configured

### Security Considerations
- [ ] Use HTTPS for all API endpoints
- [ ] Validate payment signatures properly
- [ ] Implement rate limiting
- [ ] Monitor for unusual payment patterns
- [ ] Keep private keys secure
- [ ] Regular security audits

---

**🎉 Congratulations! You now have the world's first native blockchain X402 payment system running on Splendor!**

For support, check the troubleshooting section or review the test scripts for working examples.
