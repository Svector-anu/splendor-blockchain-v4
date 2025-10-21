# x402 Examples

## Node.js Examples

- **x402-complete-flow.js** - Complete end-to-end X402 payment flow with live RPC testing
  - Demonstrates EIP-191 signing, verification, and settlement
  - Tests against live Splendor RPC endpoint
  - Run: `node docs/x402/examples/node/x402-complete-flow.js`

- **x402-sign-basic.js** - Basic X402 signature generation example
  - Shows EIP-712 signing (educational)
  - Run: `node docs/x402/examples/node/x402-sign-basic.js`

- **sign-permit-ethers.js** - Example of signing EIP-2612 permits with ethers.js
  - For ERC-20 token payments with permit
  - Run: `node docs/x402/examples/node/sign-permit-ethers.js`

## Server Examples

- Express (RPC-only) example server:
  - `Core-Blockchain/examples/x402-rpc-gated-server.js`
  - Pure JSON-RPC flow: returns 402, calls x402_verify/x402_settle
  - Run:
    - `X402_PAYTO=0xYourReceiver node Core-Blockchain/examples/x402-rpc-gated-server.js`

- Express + Middleware example server:
  - `Core-Blockchain/examples/x402-middleware-server.js`

## Testing Tools

- Postman collection:
  - `docs/x402/examples/postman/x402_rpc.postman_collection.json`

- OpenAPI sample for JSON-RPC endpoint:
  - `docs/x402/examples/openapi/x402-rpc.yaml`

## Getting Started

1. **Install dependencies**: `npm install ethers@5`
2. **Set your private key** in the example files (replace `YOUR_PRIVATE_KEY_HERE`)
3. **Run the complete flow**: `node docs/x402/examples/node/x402-complete-flow.js`

## Additional Resources

- RPC usage examples: see `../native-payments.md` and `../developer-integration.md` for curl and payload snippets.
- CLI tutorial: `docs/x402/examples/cli-tutorial.md`
