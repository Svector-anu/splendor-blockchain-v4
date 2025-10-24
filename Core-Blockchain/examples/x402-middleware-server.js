/**
 * Example: Splendor x402 Middleware server (Express)
 * This is an optional demo showing how to embed the middleware.
 */

const express = require('express');
const { splendorX402Express } = require('../x402-middleware');

// Env-configurable defaults
const PAY_TO = process.env.X402_PAYTO || '0x6BED5A6606fF44f7d986caA160F14771f7f14f69';
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || process.env.X402_RPC_URL || 'https://mainnet-rpc.splendor.org/';
const DEFAULT_ASSET = process.env.X402_ASSET || '0x0000000000000000000000000000000000000000';
const ASSET_DECIMALS = parseInt(process.env.X402_ASSET_DECIMALS || '18', 10);

const app = express();
app.use(express.json());

const x402Middleware = splendorX402Express({
  payTo: PAY_TO,
  facilitatorUrl: FACILITATOR_URL,
  defaultAsset: DEFAULT_ASSET,
  assetDecimals: ASSET_DECIMALS,
  pricing: {
    '/api/premium': '0.001',
    '/api/data/*': '0.01',
    '/api/free': '0'
  },
  defaultPrice: '0.005'
});

app.use('/api', x402Middleware);

app.get('/api/free', (req, res) => {
  res.json({ message: 'Free endpoint', paid: req.x402?.paid || false });
});

app.get('/api/premium', (req, res) => {
  res.json({ message: 'Premium content', payment: req.x402 });
});

const PORT = process.env.PORT || process.env.X402_MIDDLEWARE_PORT || 3000;
app.listen(PORT, () => {
  console.log(`x402 example server listening on ${PORT}`);
});
