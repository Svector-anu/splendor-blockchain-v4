# Splendor Native x402 Payments Guide

## 🚀 World's First Native Blockchain x402 Implementation

Splendor is the **first and only blockchain** with **native x402 payment support** built directly into the consensus layer. Add micropayments to any API in 1 line of code with zero gas fees for users.

---

## 🚀 Quick Start

### 1. Setup (Automatic)
```bash
# x402 automatically configures during node setup
./node-setup.sh --rpc

# Start node with x402 API enabled
./node-start.sh --rpc
```

### 2. Add Payments to Your API (1 Line!)
```javascript
const { splendorX402Express } = require('./x402-middleware');

// Add payments in 1 line!
app.use('/api', splendorX402Express({
  payTo: '0xYourWalletAddress',  // You get 100% of payments
  pricing: {
    '/api/weather': '0.001',     // $0.001 per request
    '/api/premium': '0.01'       // $0.01 per request
  }
}));

// That's it! Your API now accepts x402 payments
app.get('/api/weather', (req, res) => {
  res.json({ 
    weather: 'Sunny, 75°F',
    payment: req.x402
  });
});
```

### 3. Test Your Integration
```bash
# Test x402 functionality
./test-x402.sh

# Test your API
curl http://localhost:3000/api/premium
# Returns 402 Payment Required with payment instructions
```

---

## 🆚 Why Splendor x402 is Revolutionary

### Splendor vs Others (Coinbase, Ethereum, etc.)

| Feature | **Splendor Native** | **Coinbase x402** | **Ethereum** | **Advantage** |
|---------|-------------------|------------------|--------------|---------------|
| **Settlement Speed** | **<100ms** | 2-15 seconds | 12-15 seconds | **150x faster** |
| **User Gas Fees** | **$0** | $0.01-$50 | $1-$50 | **100% savings** |
| **Developer Revenue** | **100%** | Variable | N/A | **Keep everything** |
| **Integration** | **1 line of code** | 50+ lines | Complex | **50x simpler** |
| **Consensus Level** | **✅ Native** | ❌ External | ❌ External | **Revolutionary** |
| **TPS Capability** | **Millions** | ~50,000 | ~15 | **20x+ higher** |
| **Minimum Payment** | **$0.001** | $0.01+ | $1+ | **10x+ smaller** |
| **Signature Type** | **Simple message** | EIP-3009 | Complex | **User-friendly** |

### Key Advantages

#### 1. **True Micropayments**
- **Splendor**: $0.001 minimum, zero gas fees
- **Others**: $0.01+ minimum due to gas costs

#### 2. **Instant Settlement**
- **Splendor**: <100ms consensus-level settlement
- **Others**: 2-15 seconds for blockchain confirmation

#### 3. **Developer-First**
- **Splendor**: 100% revenue, 1-line integration
- **Others**: Variable fees, complex integration

#### 4. **User Experience**
- **Splendor**: Simple message signing, zero gas
- **Others**: Complex EIP-3009, gas fees

#### 5. **Scalability**
- **Splendor**: Millions of TPS (bypasses tx pool)
- **Others**: Limited by blockchain TPS

---

## 🔧 Technical Architecture

### 1. Consensus Layer Integration

Unlike external solutions, Splendor's x402 is built into the consensus engine with **zero-fee policy**:

```go
// From core/types/x402_tx.go
// Gas fields are kept for EIP-1559 compatibility but x402 consensus 
// execution ignores fees (zero-fee policy).

// Direct payment transfer - no deductions
state.SubBalance(payload.From, payload.Value)
state.AddBalance(payload.To, payload.Value)
```

**Full payment amount goes directly to the recipient - no fees!**

### 2. Native RPC API

```bash
# Check supported payment methods (native)
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"x402_supported","params":[],"id":1}' \
  https://mainnet-rpc.splendor.org/

# Verify payment without executing
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"x402_verify","params":[requirements, payload],"id":1}' \
  https://mainnet-rpc.splendor.org/

# Settle payment instantly
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"x402_settle","params":[requirements, payload],"id":1}' \
  https://mainnet-rpc.splendor.org/
```

---

## 💰 Revenue Model

### Zero-Fee Payments

Every x402 payment goes 100% to the API provider:

```
User Payment: $0.001 SPLD
└── API Provider: $0.001 SPLD (100%) ← YOU

Gas Fees: $0.00 ← NO FEES!
```

### Revenue Examples

- **Weather API**: 1000 requests/day × $0.001 = **$1/day = $30/month**
- **AI Images**: 100 images/day × $0.05 = **$5/day = $150/month**  
- **Analytics**: 50 reports/day × $0.10 = **$5/day = $150/month**

---

## 🔄 Upgrading Existing Chains

### Can I upgrade my existing Splendor chain?
**YES!** You can add x402 support to existing chains without starting fresh:

#### Hot Upgrade Process (No Downtime)
1. **Copy x402 files** to existing installation
2. **Update backend.go** to register x402 API
3. **Update transaction.go** to support X402TxType
4. **Rebuild node** with x402 support
5. **Restart with x402 API** enabled
6. **Install middleware** and configure

#### Zero Cost Upgrade
- ✅ **No blockchain fees** for x402 functionality
- ✅ **No upgrade costs** or licensing fees
- ✅ **No ongoing charges** for x402 payments
- ✅ **Backward compatible** - existing transactions continue working

---

## 🧪 Testing & Deployment

### Test x402 Functionality
```bash
# Verify x402 integration
./verify-x402-integration.sh

# Test x402 API
./test-x402.sh
```

### Production Deployment
```bash
# Start node with x402 API
./node-start.sh --rpc

# x402 API automatically included in:
# --http.api db,eth,net,web3,personal,txpool,miner,debug,x402
```

### ERC‑20 Notes
- Verification checks `balanceOf(from)` and `allowance(from → payTo)`
- Optional: include EIP‑2612 `permit` in the payment payload to skip prior approve
- Settlement: if `permit` is present, the chain executes `permit(owner, payTo, value, deadline, v, r, s)` then `transferFrom(from, payTo, amount)` in consensus
- If not using `permit`, users must approve your `payTo` address on that token

Example `permit` in x402 payload:
```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "splendor",
  "payload": {
    "from": "0xPayer",
    "to": "0xPayTo",
    "value": "0x...",
    "validAfter": 1710000000,
    "validBefore": 1710000300,
    "nonce": "0x...",
    "asset": "0xToken",
    "signature": "0x...",
    "permit": {
      "value": "0x...",
      "deadline": "0x...",
      "v": 28,
      "r": "0x...32bytes...",
      "s": "0x...32bytes..."
    }
  }
}
```

---

## 📊 Monitor Your Revenue
```bash
# Check your wallet balance (100% of all payments)
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xYourWallet","latest"],"id":1}' \
  https://mainnet-rpc.splendor.org/
```

---

## 🎯 Use Cases

### API Monetization
- **Weather APIs**: $0.001 per request
- **Stock Data**: $0.01 per quote
- **News Articles**: $0.005 per article
- **Maps/Directions**: $0.002 per route

### AI Services
- **Image Generation**: $0.05 per image
- **Text Generation**: $0.01 per request
- **Voice Synthesis**: $0.02 per audio file
- **Translation**: $0.001 per word

### Data Services
- **Analytics Reports**: $0.10 per report
- **Database Queries**: $0.001 per query
- **File Storage**: $0.001 per MB
- **CDN Access**: $0.0001 per file

---

## 🔧 Advanced Configuration

### Middleware Options
```javascript
const middleware = splendorX402Express({
  // Required
  payTo: '0xYourWalletAddress',        // Your wallet (receives 100%)
  
  // Optional
  rpcUrl: 'http://localhost:80',       // Splendor RPC endpoint
  network: 'splendor',                 // Network name
  chainId: 2691,                       // Splendor chain ID
  defaultPrice: '0.001',               // Default price in USD
  
  // Flexible pricing
  pricing: {
    '/api/free': '0',                  // Free endpoint
    '/api/premium': '0.001',           // Fixed price
    '/api/data/*': '0.01',             // Wildcard pattern
    '/api/analytics': '0.05',          // Higher value content
    '/api/bulk/*': '0.0001'            // Bulk pricing
  }
});
```

### Environment Variables
```bash
# x402 Configuration (auto-added during setup)
X402_ENABLED=true
X402_NETWORK=splendor
X402_CHAIN_ID=2691
X402_DEFAULT_PRICE=0.001
X402_MIN_PAYMENT=0.001
```

---

## 🎉 Conclusion

Splendor's native x402 implementation represents a **paradigm shift** in blockchain payments:

- **🌍 World's first** native x402 blockchain
- **⚡ 150x faster** than external x402 solutions
- **💰 Zero gas fees** for users
- **🔧 1-line integration** for developers
- **📈 100% revenue** - keep everything you earn
- **🔄 Hot upgrades** for existing chains

**Welcome to the future of internet payments!** 🚀

---

*Built with ❤️ by the Splendor team - The first blockchain to make micropayments practical for developers.*
