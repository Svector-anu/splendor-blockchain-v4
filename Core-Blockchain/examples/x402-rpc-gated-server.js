/**
 * Example: Pure RPC-gated Express server using Splendor native x402
 *
 * - No middleware dependency; calls x402 RPC methods directly
 * - Demonstrates the full 402 → verify → settle flow
 */

const express = require('express');
const fetch = require('node-fetch');

// Config via env
const RPC_URL = process.env.X402_RPC_URL || process.env.SPLENDOR_RPC || 'https://mainnet-rpc.splendor.org/';
const PAY_TO = (process.env.X402_PAYTO || '').trim();
const ASSET = (process.env.X402_ASSET || '0x0000000000000000000000000000000000000000').trim();
const MAX_AMOUNT_REQUIRED_HEX = (process.env.X402_MAX_AMOUNT_HEX || '0x9184e72a000').trim(); // default ~0.0001 in 18 decimals
const NETWORK = process.env.X402_NETWORK || 'splendor';
const MAX_TIMEOUT_SECONDS = parseInt(process.env.X402_MAX_TIMEOUT || '300', 10);

if (!PAY_TO) {
  console.error('X402_PAYTO is required (receiver address)');
  process.exit(1);
}

const app = express();
app.use(express.json());

// Utility: call Splendor RPC
async function rpcCall(method, params, id = 1) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id })
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || String(data.error));
  }
  return data.result;
}

// Paid endpoint
app.get('/api/premium', async (req, res) => {
  try {
    const paymentHeader = req.headers['x-payment'];

    if (!paymentHeader) {
      // Return 402 with requirements (accepts array)
      const requirements = {
        scheme: 'exact',
        network: NETWORK,
        maxAmountRequired: MAX_AMOUNT_REQUIRED_HEX,
        resource: '/api/premium',
        description: 'Payment required for /api/premium',
        mimeType: 'application/json',
        payTo: PAY_TO,
        maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
        asset: ASSET,
      };
      return res.status(402).json({ x402Version: 1, accepts: [requirements] });
    }

    // Decode client payment payload (Base64 JSON)
    let payment;
    try {
      payment = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
    } catch (e) {
      return res.status(400).json({ error: 'Invalid X-Payment header' });
    }

    // Rebuild requirements for verification
    const requirements = {
      scheme: 'exact',
      network: NETWORK,
      maxAmountRequired: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      resource: '/api/premium',
      description: 'Payment required for /api/premium',
      mimeType: 'application/json',
      payTo: PAY_TO,
      maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
      asset: ASSET,
    };

    // 1) Verify
    const verify = await rpcCall('x402_verify', [requirements, payment], 1001);
    if (!verify || !verify.isValid) {
      return res.status(402).json({ error: 'Payment invalid', details: verify && verify.invalidReason });
    }

    // 2) Settle (uses constrained maxAmountRequired)
    const settleReq = { ...requirements, maxAmountRequired: MAX_AMOUNT_REQUIRED_HEX };
    const settle = await rpcCall('x402_settle', [settleReq, payment], 1002);
    if (!settle || !settle.success) {
      return res.status(402).json({ error: 'Payment settlement failed', details: settle && settle.error });
    }

    // Success — return content
    res.set('X-Payment-Response', Buffer.from(JSON.stringify({
      success: true,
      txHash: settle.txHash,
      networkId: settle.networkId || NETWORK
    })).toString('base64'));

    return res.json({
      message: 'Premium content',
      payment: {
        payer: verify.payerAddress,
        txHash: settle.txHash,
        networkId: settle.networkId || NETWORK
      }
    });
  } catch (err) {
    console.error('RPC-gated error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Free endpoint
app.get('/api/free', (req, res) => {
  res.json({ message: 'Free endpoint (no payment required)' });
});

const PORT = process.env.PORT || process.env.X402_EXAMPLE_PORT || 3010;
app.listen(PORT, () => {
  console.log(`x402 RPC-gated example listening on ${PORT}`);
  console.log('Config:', { RPC_URL, PAY_TO, ASSET, MAX_AMOUNT_REQUIRED_HEX, NETWORK });
});

