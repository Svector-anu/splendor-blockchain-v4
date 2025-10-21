# x402 Payment Guide (Pricing & Payloads)

This guide explains how to price endpoints and construct x402 payment payloads, including optional ERC‑20 EIP‑2612 `permit`.

## Currencies

- SPLD (native, 18 decimals)
- ERC‑20 tokens (e.g., USDC/USDT 6 decimals; TND 18 decimals)

## Requirements object (server → client)
```json
{
  "scheme": "exact",
  "network": "splendor",
  "maxAmountRequired": "0x...",    
  "resource": "/api/premium",
  "description": "Payment required",
  "payTo": "0xApiProvider",
  "maxTimeoutSeconds": 300,
  "asset": "0xTokenOrZeroAddress"
}
```

## Payload (client → server)
```javascript
const message = `x402-payment:${from}:${to}:${value}:${validAfter}:${validBefore}:${nonce}:${chainId}`;
const signature = await wallet.signMessage(message);

const payment = {
  x402Version: 1,
  scheme: 'exact',
  network: 'splendor',
  payload: {
    from, to, value,
    validAfter, validBefore,
    nonce,
    asset,          // 0x0 for SPLD, or ERC‑20 address
    signature,
    // Optional ERC‑20 EIP‑2612 permit
    // permit: { value: '0x..', deadline: '0x..', v: 28, r: '0x..32', s: '0x..32' }
  }
};
```

## Flow
- Server replies 402 with requirements
- Client signs payload (no gas)
- Server verifies via RPC (x402_verify)
- Server settles via RPC (x402_settle)

## ERC‑20 specifics
- Without permit: user must `approve(payTo, amount)` once
- With permit: include `permit` in payload to skip on‑chain approve

See `native-payments.md` for consensus settlement details.
