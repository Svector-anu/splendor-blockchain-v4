# Splendor x402 Native Payments Middleware

The world's first **native x402 implementation** built directly into a blockchain. Ultra-fast micropayments with **millions of TPS** capability.

## 🚀 Features

- **Native Integration**: Built directly into Splendor blockchain core
- **Ultra-Fast**: Millions of TPS with instant settlement
- **No Gas Fees**: Users don't pay gas for micropayments
- **HTTP Native**: Standard x402 protocol over HTTP
- **Framework Support**: Express.js, Fastify, and more
- **$0.001 Minimum**: Smallest payments in crypto
- **100% Revenue**: API providers keep all payment revenue

## 💰 Revenue Model

### **Zero-Fee Payments**

```
User Payment: $0.001 SPLD
└── API Provider: $0.001 SPLD (100%) ← YOU (THE DEVELOPER)
```

**You keep 100% of all payments to your API - NO FEES!**

## 📦 Installation

```bash
# Copy from Splendor blockchain
cp -r /path/to/Core-Blockchain/x402-middleware ./
cd x402-middleware
npm install
```

## 🔧 Quick Start

### Express.js

```javascript
const express = require('express');
const { splendorX402Express } = require('./x402-middleware');

const app = express();

// Add x402 payments to your API in 1 line
app.use('/api', splendorX402Express({
  payTo: '0xYourWalletAddress',        // You get 100% of payments
  rpcUrl: 'http://splendor-rpc:80',    // Splendor RPC endpoint
  pricing: {
    '/api/weather': '0.001',           // $0.001 per weather request
    '/api/premium': '0.01',            // $0.01 for premium data
    '/api/analytics': '0.05',          // $0.05 for analytics
    '/api/free': '0'                   // Free endpoint
  }
}));

// These endpoints now require payment
app.get('/api/weather', (req, res) => {
  res.json({ 
    weather: 'Sunny, 75°F',
    payment: req.x402  // Payment details
  });
});

app.get('/api/premium', (req, res) => {
  res.json({ 
    data: 'Premium content here',
    payment: req.x402
  });
});

app.listen(3000);
```

### Fastify

```javascript
const fastify = require('fastify')();
const { splendorX402Fastify } = require('./x402-middleware');

// Register x402 plugin
fastify.register(splendorX402Fastify, {
  payTo: '0xYourWalletAddress',
  rpcUrl: 'http://splendor-rpc:80',
  pricing: {
    '/api/premium': '0.001'
  }
});

fastify.get('/api/premium', async (request, reply) => {
  return { 
    message: 'Premium content!',
    payment: request.x402
  };
});

fastify.listen(3000);
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client App    │    │  Your API Server │    │ Splendor Chain  │
│                 │    │                  │    │                 │
│ 1. Request API  │───▶│ 2. Check Payment │    │                 │
│ 2. Get 402      │◀───│ 3. Return 402    │    │                 │
│ 3. Sign Payment │    │                  │    │                 │
│ 4. Send Payment │───▶│ 5. Verify & Settle──▶│ 6. Instant TX   │
│ 5. Get Content  │◀───│ 6. Return Content│◀───│ 7. Full Payment │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                │ 100% → You      │
                                                └─────────────────┘
```

## 💰 Complete Payment Flow

### 1. Client Makes Request (No Payment)
```bash
curl http://localhost:3000/api/premium
```

**Response: 402 Payment Required**
```json
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "splendor",
    "maxAmountRequired": "0x8ac7230489e80000",
    "resource": "/api/premium",
    "payTo": "0xYourWalletAddress",
    "asset": "0x0000000000000000000000000000000000000000"
  }]
}
```

### 2. Client Creates Payment Signature
```javascript
// Simple message signing (no EIP-3009!)
const payment = {
  x402Version: 1,
  scheme: "exact",
  network: "splendor",
  payload: {
    from: "0xClientAddress",
    to: "0xYourWalletAddress", 
    value: "0x8ac7230489e80000", // 0.001 SPLD in wei
    validAfter: Math.floor(Date.now() / 1000),
    validBefore: Math.floor(Date.now() / 1000) + 3600,
    nonce: "0x" + crypto.randomBytes(32).toString('hex'),
    signature: "0x..." // Simple signature
  }
};
```

### 3. Client Sends Payment
```bash
curl -H "X-Payment: $(echo $PAYMENT | base64)" \
     http://localhost:3000/api/premium
```

**Response: 200 OK + Content**
```json
{
  "message": "Premium content!",
  "payment": {
    "paid": true,
    "amount": "0.001",
    "txHash": "0x...",
    "payer": "0xClientAddress"
  }
}
```

**What happens:** Full $0.001 payment goes to your wallet instantly!

## ⚙️ Configuration Options

```javascript
const middleware = splendorX402Express({
  // Required
  payTo: '0xYourWalletAddress',        // Your wallet (receives 100%)
  
  // Optional
  rpcUrl: 'http://localhost:80',       // Splendor RPC endpoint
  network: 'splendor',                 // Network name
  chainId: 2691,                       // Splendor chain ID
  defaultPrice: '0.001',               // Default price in USD
  
  // Pricing rules (flexible patterns)
  pricing: {
    '/api/free': '0',                  // Free endpoint
    '/api/premium': '0.001',           // Fixed price
    '/api/data/*': '0.01',             // Wildcard pattern
    '/api/analytics': '0.05',          // Higher value content
    '/api/bulk/*': '0.0001'            // Bulk pricing
  }
});
```

## 🧪 Testing

### **1. Start Splendor Node**
```bash
cd Core-Blockchain
./node-start.sh --rpc
```

### **2. Install Dependencies**
```bash
cd x402-middleware
npm install
```

### **3. Run Test Server**
```bash
npm test
```

### **4. Test Endpoints**
```bash
# Free endpoint (no payment required)
curl http://localhost:3000/api/free

# Paid endpoint (returns 402 Payment Required)
curl -i http://localhost:3000/api/premium

# Health check
curl http://localhost:3000/health
```

## 🔗 Client Integration Examples

### JavaScript/Node.js Client
```javascript
const axios = require('axios');
const crypto = require('crypto');
const { ethers } = require('ethers');

// Create payment signature
async function createPayment(wallet, to, amount) {
  const from = wallet.address;
  const validAfter = Math.floor(Date.now() / 1000);
  const validBefore = validAfter + 3600;
  const nonce = "0x" + crypto.randomBytes(32).toString('hex');
  const asset = "0x0000000000000000000000000000000000000000";
  const chainId = 2691;
  
  // Sign message
  const message = `x402-payment:${from}:${to}:${amount}:${validAfter}:${validBefore}:${nonce}:${asset}:${chainId}`;
  const signature = await wallet.signMessage(message);
  
  return {
    x402Version: 1,
    scheme: "exact", 
    network: "splendor",
    payload: {
      from, to, 
      value: amount,
      validAfter,
      validBefore,
      nonce,
      asset,
      signature
    }
  };
}

// Make paid request
async function paidRequest(url, payment) {
  const paymentHeader = Buffer.from(JSON.stringify(payment)).toString('base64');
  
  const response = await axios.get(url, {
    headers: { 'X-Payment': paymentHeader }
  });
  
  return response.data;
}

// Usage
const wallet = new ethers.Wallet('0xYourPrivateKey');
const payment = await createPayment(wallet, apiProviderAddress, "0x38d7ea4c68000"); // 0.001 SPLD
const result = await paidRequest('http://api.example.com/premium', payment);
```

### Python Client
```python
import requests
import json
import base64
import hashlib
import time
from eth_account import Account
from eth_account.messages import encode_defunct

def create_payment(private_key, to_addr, amount):
    account = Account.from_key(private_key)
    from_addr = account.address
    valid_after = int(time.time())
    valid_before = valid_after + 3600
    nonce = "0x" + hashlib.sha256(str(time.time()).encode()).hexdigest()
    asset = "0x0000000000000000000000000000000000000000"
    chain_id = 2691
    
    # Create message
    message = f"x402-payment:{from_addr}:{to_addr}:{amount}:{valid_after}:{valid_before}:{nonce}:{asset}:{chain_id}"
    
    # Sign message
    message_hash = encode_defunct(text=message)
    signed = account.sign_message(message_hash)
    
    return {
        "x402Version": 1,
        "scheme": "exact",
        "network": "splendor",
        "payload": {
            "from": from_addr,
            "to": to_addr,
            "value": amount,
            "validAfter": valid_after,
            "validBefore": valid_before,
            "nonce": nonce,
            "asset": asset,
            "signature": signed.signature.hex()
        }
    }

def paid_request(url, payment):
    payment_header = base64.b64encode(
        json.dumps(payment).encode()
    ).decode()
    
    response = requests.get(url, headers={
        'X-Payment': payment_header
    })
    
    return response.json()

# Usage
payment = create_payment('0xYourPrivateKey', api_provider_address, "0x38d7ea4c68000")
result = paid_request('http://api.example.com/premium', payment)
```

## 🌟 Why Splendor x402 is Better

| Feature | **Splendor x402** | Standard x402 | Credit Cards |
|---------|------------------|---------------|--------------|
| **Settlement** | **Instant** | 2+ seconds | 2-3 days |
| **Minimum** | **$0.001** | $0.001 | $0.50+ |
| **Fees** | **None** | Gas fees | 2.9% + $0.30 |
| **TPS** | **Millions** | ~50,000 | ~65,000 |
| **Integration** | **1 line** | Multiple steps | Complex |
| **Revenue** | **100% to you** | Variable | ~97% to you |
| **EIP-3009** | **Not needed** | Required | N/A |

## 📚 API Reference

### Middleware Options

- `payTo` (string, required): Your wallet address (receives 100% of payments)
- `rpcUrl` (string): Splendor RPC endpoint (default: 'http://localhost:80')
- `network` (string): Network name (default: 'splendor')
- `chainId` (number): Chain ID (default: 2691)
- `pricing` (object): Path-to-price mapping
- `defaultPrice` (string): Default price in USD (default: '0.001')

### Request Object Extensions

After successful payment, requests include:
```javascript
req.x402 = {
  paid: true,          // Payment successful
  amount: "0.001",     // Amount paid (USD)
  txHash: "0x...",     // Transaction hash
  payer: "0x..."       // Payer address
}
```

## 📊 Revenue Tracking

### **Monitor Your Earnings**
```bash
# Check your wallet balance (100% of all payments)
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xYourWalletAddress","latest"],"id":1}' \
  http://splendor-rpc:80
```

## 🎯 Use Cases

### **API Monetization**
- **Weather APIs**: $0.001 per request
- **Stock Data**: $0.01 per quote
- **News Articles**: $0.005 per article
- **Maps/Directions**: $0.002 per route

### **AI Services**
- **Image Generation**: $0.05 per image
- **Text Generation**: $0.01 per request
- **Voice Synthesis**: $0.02 per audio file
- **Translation**: $0.001 per word

### **Data Services**
- **Analytics Reports**: $0.10 per report
- **Database Queries**: $0.001 per query
- **File Storage**: $0.001 per MB
- **CDN Access**: $0.0001 per file

### **Content & Media**
- **Premium Articles**: $0.01 per article
- **Video Streaming**: $0.05 per hour
- **Music Streaming**: $0.001 per song
- **E-books**: $0.50 per book

## 🌟 Why Choose Splendor x402?

### **For Developers:**
- **100% revenue** (you keep ALL the money)
- **1-line integration** (add payments instantly)
- **No crypto complexity** (HTTP-native)
- **Instant settlement** (no waiting for confirmations)
- **No gas fees** for users (better user experience)

### **For Users:**
- **Tiny payments** ($0.001 minimum)
- **No gas fees** (just pay for the service)
- **Instant access** (no waiting)
- **Simple signing** (no EIP-3009 complexity)
- **HTTP-native** (works with any app)

### **vs Competition:**

| Feature | **Splendor x402** | Standard x402 | Credit Cards |
|---------|------------------|---------------|--------------|
| **Your Revenue** | **100%** | Variable | ~97% |
| **Settlement** | **Instant** | 2+ seconds | 2-3 days |
| **Minimum** | **$0.001** | $0.001 | $0.50+ |
| **User Fees** | **$0** | Gas fees | $0 |
| **Integration** | **1 line** | Multiple steps | Complex |

## 🎊 Ready to Monetize Your API!

**With Splendor x402, you can:**
- ✅ **Add payments to any API** in 1 line of code
- ✅ **Keep 100% of all revenue** (zero fees!)
- ✅ **No gas fees** for your users (better experience)
- ✅ **Instant settlement** (millions of TPS)
- ✅ **No EIP-3009 complexity** (simple message signing)

**Start earning from your APIs today!**

---

**Built with ❤️ by the Splendor team**

*The first blockchain to make micropayments practical for developers.*
