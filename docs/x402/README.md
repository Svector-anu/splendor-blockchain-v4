# Splendor X402 Payment Protocol

## 🚀 Stripe for Web3

X402 is **instant wallet-based payment verification** with **flexible settlement** - essentially **Stripe for Web3**. Enable pay-per-use APIs, content paywalls, and micropayments with just wallet signatures.

**✅ Production Ready** | **✅ Wallet Compatible** | **✅ Developer Friendly**

## 📚 Documentation

### 🚀 Quick Start (Recommended)
- **[X402 Middleware Guide](../../Core-Blockchain/x402-middleware/README.md)** - **START HERE!** Complete integration guide with working examples
  - 1-line integration for Express.js and Fastify
  - Client integration examples (JavaScript, Python)
  - Revenue model and payment flow
  - Production deployment guide

### Getting Started
- **[Developer Pitch](DEVELOPER_PITCH.md)** - Why X402 is a game-changer for Web3 payments
- **[Payment Implementation Guide](PAYMENT_IMPLEMENTATION.md)** - Complete technical implementation guide

### Integration Guides
- **[Developer Integration](developer-integration.md)** - End-to-end integration guide (RPC, payloads, flows, ERC-20, permit)
- **[Payment Guide](payment-guide.md)** - Pricing and payload formats (quick reference)

### Technical Details
- **[Native Payments](native-payments.md)** - Technical details of on-chain settlement and architecture
- **[Diagrams](diagrams.md)** - Visual architecture diagrams

### Code Examples
- **[Examples Directory](examples/)** - Working code examples
- **Express Middleware**: `Core-Blockchain/examples/x402-middleware-server.js`
- **RPC Server**: `Core-Blockchain/examples/x402-rpc-gated-server.js`
- **Python Flask**: `Core-Blockchain/examples/x402-rpc-gated-flask.py`

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
  payTo: '0xYourWalletAddress',
  pricing: {
    '/api/premium': '0.01'  // $0.01 per request
  }
}));
```

## 📖 Learn More

For complete implementation details, see the **[Payment Implementation Guide](PAYMENT_IMPLEMENTATION.md)**.

For integration examples and payload formats, see **[developer-integration.md](developer-integration.md)** and **[payment-guide.md](payment-guide.md)**.
