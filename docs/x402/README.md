# Splendor X402 Payment Protocol

## 🚀 Native Blockchain Payments - Zero Fees, Instant Settlement

X402 is **instant payment verification** built directly into Splendor's blockchain consensus layer. Enable pay-per-use APIs, content paywalls, and micropayments with simple wallet signatures.

**✅ Production Ready** | **✅ Zero Fees** | **✅ 100% Revenue** | **✅ AI Agent Compatible**

---

## 🎯 Key Features

- **100% Revenue**: API providers keep all payment revenue - zero platform fees
- **Zero Gas Fees**: Users don't pay blockchain gas fees
- **Instant Settlement**: Payments settle in 1 second (consensus-level)
- **Simple Integration**: Add payments in 1 line of code
- **AI Agent Ready**: Works with private keys (no browser needed)
- **Also Human-Friendly**: Works with MetaMask, WalletConnect, etc.
- **True Micropayments**: $0.001 minimum payments

---

## 📚 Documentation

### 🚀 Quick Start (Recommended)
- **[X402 Middleware Guide](../../Core-Blockchain/x402-middleware/README.md)** - **START HERE!** Complete integration guide with working examples
  - 1-line integration for Express.js and Fastify
  - Client integration examples (JavaScript, Python)
  - AI agent examples with private keys
  - Production deployment guide

### Technical Guides
- **[Payment Implementation Guide](PAYMENT_IMPLEMENTATION.md)** - Complete technical implementation
- **[Developer Integration](developer-integration.md)** - End-to-end integration guide
- **[Native Payments](native-payments.md)** - Technical architecture details

### Code Examples
- **Express Middleware**: `Core-Blockchain/examples/x402-middleware-server.js`
- **RPC Server**: `Core-Blockchain/examples/x402-rpc-gated-server.js`
- **Python Flask**: `Core-Blockchain/examples/x402-rpc-gated-flask.py`

---

## 🚀 Quick Start

### Check X402 Support

```bash
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"x402_supported","params":[],"id":1}' \
  https://mainnet-rpc.splendor.org/
```

### Add to Your API (1 Line!)

```javascript
const { splendorX402Express } = require('./x402-middleware');

app.use('/api', splendorX402Express({
  payTo: '0xYourWalletAddress',  // You get 100% of payments
  pricing: {
    '/api/premium': '0.01'  // $0.01 per request
  }
}));
```

---

## 🤖 Payment Methods

### Option 1: Private Key (Perfect for AI Agents)
```javascript
const { ethers } = require('ethers');

// AI agent signs with private key
const wallet = new ethers.Wallet('0xPrivateKey');
const message = `x402-payment:${from}:${to}:${amount}:...`;
const signature = await wallet.signMessage(message);

// No browser, no MetaMask, no human interaction needed!
```

### Option 2: MetaMask/WalletConnect (For Human Users)
```javascript
// User signs with their wallet extension
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const signature = await signer.signMessage(paymentMessage);

// Works with MetaMask, WalletConnect, Coinbase Wallet, etc.
```

**Both methods work identically** - choose based on your use case!

---

## 💰 Revenue Model

### **100% to You - Zero Fees**

```
User pays: $0.001 SPLD
└── You receive: $0.001 SPLD (100%)

Platform fees: $0
Gas fees: $0
Total fees: $0
```

**You keep everything you earn!**

---

## 🆚 vs Coinbase Commerce

| Feature | **Splendor X402** | **Coinbase Commerce** |
|---------|------------------|---------------------|
| **Settlement** | **1 second** | 15+ minutes |
| **Minimum Payment** | **$0.001** | $1+ practical |
| **Platform Fees** | **0%** | 1% |
| **Gas Fees (User)** | **$0** | $1-50+ |
| **Your Revenue** | **100%** | 99% |
| **Integration** | **1 line** | Webhooks, hosted pages |
| **AI Agent Support** | **✅ Yes** | ❌ No (requires human) |
| **Private Key Signing** | **✅ Yes** | ❌ No |
| **Browser Required** | **❌ No** | ✅ Yes |

### **Coinbase Commerce Approach:**
- User visits Coinbase-hosted payment page
- Sends crypto to Coinbase-generated address
- Coinbase monitors blockchain
- Merchant gets webhook after confirmations
- **Requires human interaction** - not suitable for AI agents

### **Splendor X402 Approach:**
- User (or AI agent) signs payment message
- Instant verification via signature
- Immediate settlement on-chain
- **Works programmatically** - perfect for AI agents

---

## 🤖 Perfect for AI Agents

X402 is designed for autonomous AI agents that need to pay for services:

```javascript
class AIAgent {
  constructor(privateKey) {
    this.wallet = new ethers.Wallet(privateKey);
  }
  
  async payForAPI(url, amount) {
    // Create and sign payment (no human needed!)
    const payment = await this.createPayment(amount);
    
    // Make paid request
    const response = await axios.get(url, {
      headers: { 'X-Payment': payment }
    });
    
    return response.data;
  }
}

// AI agent autonomously pays for data
const agent = new AIAgent('0xAgentPrivateKey');
const weatherData = await agent.payForAPI('https://api.weather.com/premium', '0.001');
```

**This is impossible with Coinbase Commerce** - it requires human interaction.

---

## 📖 Learn More

For complete implementation details, see the **[Payment Implementation Guide](PAYMENT_IMPLEMENTATION.md)**.

For integration examples and payload formats, see **[developer-integration.md](developer-integration.md)**.

For middleware usage, see **[X402 Middleware README](../../Core-Blockchain/x402-middleware/README.md)**.

---

**Built with ❤️ by the Splendor team**

*The first blockchain to make micropayments practical for AI agents and developers.*
