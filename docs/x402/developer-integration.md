# Developer Integration Guide — Splendor Native x402

This guide shows, in depth, how to integrate native x402 payments into your app or API using Splendor’s RPC only. No facilitator or third service is needed.

Audience: API/backend engineers and wallet developers.

Status: Production-ready with SPLD (native) and ERC‑20 (incl. optional EIP‑2612 permit).

---

## 1) Prerequisites

- RPC endpoint: `https://mainnet-rpc.splendor.org/` (or your own node)
- Chain ID: `2691`
- Your receive address (`payTo`): EVM address that will receive payments
- Asset:
  - Native SPLD: `0x0000000000000000000000000000000000000000`
  - Or any ERC‑20 token address
- Time sync: clients must be within a reasonable clock skew (±60s recommended).
- For ERC‑20 without permit: payer must have called `approve(payTo, amount)` at least once.

Optional (ERC‑20 permit): prepare to sign EIP‑2612 typed data for tokens that support it (see §7.2).

---

## 1.1) 3‑Minute Quick Start (RPC‑only)

1) Your API, when hit without payment, responds 402 with `PaymentRequirements`.

2) The client signs the x402 message (see §4) and sends back `PaymentPayload` (Base64 in `X-Payment` header is common).

3) Your API calls:
- `x402_verify(requirements, payload)`
- If valid → `x402_settle(requirements, payload)`

4) On success, return the content to the client.

All calls go to `https://mainnet-rpc.splendor.org/` or your own node.

---

## 2) Integration Options

You have two ways to gate your content with x402:

- RPC‑only (recommended): Your server returns 402 + requirements, then uses RPC calls `x402_verify` and `x402_settle`.
- Middleware (optional): Import the provided Express/Fastify middleware. See `Core-Blockchain/examples/x402-middleware-server.js`.

This guide focuses on the RPC‑only route.

---

## 3) Protocol Objects

### 3.1 PaymentRequirements (server → client)

Fields:
- `scheme`: `"exact"`
- `network`: `"splendor"`
- `maxAmountRequired`: hex string amount (see §5), e.g. `"0x9184e72a000"`
- `resource`: freeform string (path or product id)
- `description`: human text
- `mimeType`: optional, e.g. `"application/json"`
- `payTo`: EVM address (your address)
- `maxTimeoutSeconds`: expected validity window (e.g. 300)
- `asset`: token address (zero for native SPLD)

Example:
```json
{
  "scheme": "exact",
  "network": "splendor",
  "maxAmountRequired": "0x9184e72a000",
  "resource": "/api/premium",
  "description": "Payment required for /api/premium",
  "mimeType": "application/json",
  "payTo": "0xYourReceiver",
  "maxTimeoutSeconds": 300,
  "asset": "0x0000000000000000000000000000000000000000"
}
```

### 3.2 PaymentPayload (client → server)

Top-level:
- `x402Version`: `1`
- `scheme`: `"exact"`
- `network`: `"splendor"`
- `payload`: `PaymentPayloadData`

`PaymentPayloadData`:
- `from`: payer address
- `to`: receiver (must equal `payTo`)
- `value`: hex amount (see §5)
- `validAfter`: unix seconds
- `validBefore`: unix seconds
- `nonce`: 32‑byte hex (random)
- `asset`: token address (zero for SPLD)
- `signature`: 65‑byte ECDSA (see §4)
- `permit` (optional, ERC‑20 only): `{ value, deadline, v, r, s }`

---

## 4) Message Signing (x402 signature)

Canonical message (v2) the user signs:

```
x402-payment:{from}:{to}:{valueHex}:{validAfter}:{validBefore}:{nonceHex}:{assetHex}:{chainId}
```

- Encoding:
  - `from`, `to`, `assetHex` are checksum EVM addresses
  - `valueHex` is 0x‑prefixed hex integer (wei or token units)
  - `nonceHex` is 0x‑prefixed 32‑byte random hex
  - `chainId` is integer (2691)
- Hashing/signing: EIP‑191 prefixed message (`accounts.TextHash` in go‑ethereum); produce a 65‑byte signature `{r,s,v}` where `v` is 27/28 or 0/1.

Server‑side verify accepts strict canonical format in consensus; API path is permissive for legacy clients.

---

### 4.1 Code — JavaScript (ethers v6)

```js
import { ethers } from 'ethers'

const chainId = 2691
const message = `x402-payment:${from}:${to}:${valueHex}:${validAfter}:${validBefore}:${nonceHex}:${assetHex}:${chainId}`
const signature = await wallet.signMessage(message)
```

### 4.2 Code — web3.js

```js
// Assumes `web3.eth.personal.sign` or `eth_sign` compatible provider
const from = accounts[0]
const sig = await web3.eth.personal.sign(message, from)
```

### 4.3 Code — Python (eth‑account)

```python
from eth_account import Account
from eth_account.messages import encode_defunct

msg = f"x402-payment:{from_addr}:{to_addr}:{value_hex}:{valid_after}:{valid_before}:{nonce_hex}:{asset_hex}:{chain_id}"
message = encode_defunct(text=msg)
signed = Account.sign_message(message, private_key=PRIVATE_KEY)
signature = signed.signature.hex()  # 0x + 65 bytes
```

---

## 5) Amounts & Decimals

- Native SPLD: 18 decimals. `value` is wei (1 SPLD = 1e18 wei).
- ERC‑20: Use the token’s decimals (commonly 6 or 18). `value` is the scaled integer in token units.

Example (USDC 6 decimals): `$0.01` → `10000` units → `0x2710`.

---

## 6) End‑to‑End Flow

1) Client calls your paid endpoint without payment → You return HTTP 402 with `PaymentRequirements` (possibly under an `accepts` array for multiple options).

2) Client constructs and signs the x402 message, creates `PaymentPayload`.

3) Your server calls RPC `x402_verify` to pre‑validate:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"x402_verify","params":[REQUIREMENTS, PAYMENT],"id":1}' \
  https://mainnet-rpc.splendor.org/
```

4) If valid, call RPC `x402_settle`:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"x402_settle","params":[REQUIREMENTS, PAYMENT],"id":1}' \
  https://mainnet-rpc.splendor.org/
```

5) On success, you’ll receive `{ success: true, txHash, networkId }`. You can then serve the content.

---

### 6.1 Full Express Example (RPC‑only)

See `Core-Blockchain/examples/x402-rpc-gated-server.js` for a complete server. Run:

```bash
X402_PAYTO=0xYourReceiver node Core-Blockchain/examples/x402-rpc-gated-server.js
```

It returns 402 with requirements, verifies payloads via `x402_verify`, and settles via `x402_settle`.

---

## 7) ERC‑20 Tokens

### 7.1 Approve path (simple)

Payer runs once per token:

```js
// ethers v6
const erc20 = new ethers.Contract(TOKEN, ["function approve(address,uint256) returns (bool)"], signer)
await erc20.approve(payTo, amount)
```

Then proceed with x402 as normal.

### 7.2 Permit path (no approve)

If the token supports EIP‑2612, the client can sign a typed `permit` and place it inside `PaymentPayload.payload.permit`:

```json
"permit": {
  "value": "0x...",         
  "deadline": "0x...",      
  "v": 28,
  "r": "0x...32bytes...",
  "s": "0x...32bytes..."
}
```

Notes:
- Domain: `{ name, version, chainId, verifyingContract }` is token‑specific. Use the token’s official docs or ABIs.
- Some stablecoins deviate from the spec (custom domain/version). If a permit call reverts, our node automatically falls back to requiring `allowance`.

### 7.3 What the chain does

- Verify path (RPC): checks `balanceOf(from)`, and either simulates `permit` or requires `allowance(from → payTo)`.
- Settlement (consensus): if `permit` present, executes token `permit(...)` first, then `transferFrom(from, payTo, amount)` with `msg.sender = payTo`.
- Return handling: treats empty return as success (legacy tokens) or decodes 32‑byte boolean for standard tokens.

### 7.4 Code — Sign EIP‑2612 Permit (ethers v6)

OpenZeppelin ERC20Permit (typical) uses EIP‑712 typed data:

```js
// 1) Fetch token metadata
const name = await erc20.name()
let version
try { version = await erc20.version() } catch { version = '1' }
const nonce = await erc20.nonces(owner)
const deadline = Math.floor(Date.now()/1000) + 3600

// 2) Build EIP‑712 domain and types
const domain = { name, version, chainId: 2691, verifyingContract: token }
const types = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
}
const message = { owner, spender: payTo, value, nonce, deadline }

// 3) Sign typed data
const sig = await wallet.signTypedData(domain, types, message)
const split = ethers.Signature.from(sig) // { r, s, v }

// 4) Put into PaymentPayload.payload.permit
payload.payload.permit = {
  value: `0x${value.toString(16)}`,
  deadline: `0x${deadline.toString(16)}`,
  v: split.v,
  r: split.r,
  s: split.s
}
```

Note: Some tokens (e.g., DAI’s historical `Permit`) use different fields like `holder`, `expiry`, `allowed`. Consult token docs.

### 7.5 Code — Python (eth‑account EIP‑712)

```python
from eth_account.messages import encode_structured_data
from eth_account import Account

domain = {
  'name': name,
  'version': version,
  'chainId': 2691,
  'verifyingContract': token
}
types = {
  'Permit': [
    {'name': 'owner', 'type': 'address'},
    {'name': 'spender', 'type': 'address'},
    {'name': 'value', 'type': 'uint256'},
    {'name': 'nonce', 'type': 'uint256'},
    {'name': 'deadline', 'type': 'uint256'},
  ]
}
message = {
  'owner': owner,
  'spender': pay_to,
  'value': int(value),
  'nonce': int(nonce),
  'deadline': int(deadline),
}

typed = {
  'types': types,
  'domain': domain,
  'primaryType': 'Permit',
  'message': message,
}

signable = encode_structured_data(primitive=typed)
signed = Account.sign_message(signable, private_key=PRIVATE_KEY)
sig_bytes = signed.signature
```

---

## 8) Reference: JSON‑RPC Methods

### 8.1 x402_supported

Request:
```json
{"jsonrpc":"2.0","method":"x402_supported","params":[],"id":1}
```
Response:
```json
{"jsonrpc":"2.0","result":{"kinds":[{"scheme":"exact","network":"splendor"}]},"id":1}
```

### 8.2 x402_verify

Request `params = [requirements, payment]` (see §3):
```json
{"jsonrpc":"2.0","method":"x402_verify","params":[{...requirements...},{...payment...}],"id":1}
```
Response:
```json
{"jsonrpc":"2.0","result":{"isValid":true,"payerAddress":"0x..."},"id":1}
```

### 8.3 x402_settle

Request `params = [requirements, payment]`:
```json
{"jsonrpc":"2.0","method":"x402_settle","params":[{...requirements...},{...payment...}],"id":1}
```
Response:
```json
{"jsonrpc":"2.0","result":{"success":true,"txHash":"0x...","networkId":"splendor"},"id":1}
```

---

## 9) Security & Best Practices

- Time window: keep `validBefore - validAfter` minimal (e.g. 5 minutes). Reject stale or future‑dated payloads.
- Nonces: use a strong 32‑byte random nonce per payment. Don’t reuse.
- TLS: always serve over HTTPS; never leak signatures over plaintext.
- Amounts: always use integer math and correct token decimals.
- Replay safety: the chain persists `(payer, nonce)` usage; server should also add rate‑limits and idempotency.
- ERC‑20 risk: treat zero/false return carefully; our settlement decodes and validates standard cases.

### 9.1 Server patterns & idempotency

- Use the `nonce` as an idempotency key. Cache `(from, nonce) → settled` to protect your own backend and to align with the chain’s replay protection.
- Always verify that: `payload.payload.to == requirements.payTo` and `payload.payload.asset == requirements.asset`.
- Return 402 with `accepts: [ requirements ]` if missing or invalid payment; let clients retry with a fresh payload.

### 9.2 Pricing & decimals

- If pricing in USD, convert to token units server‑side using your own feed. Avoid floating point; use integer math.
- Example: USDC 6 decimals → `$0.01` = `10_000` → `0x2710`.

### 9.3 Observability

- On settlement, read the transaction receipt for ERC‑20 `Transfer` logs.
- For native SPLD, balance changes will reflect immediately; structured settlement events may be added later.

---

## 10) Example: Node.js client payload

```js
import { ethers } from "ethers"

const rpc = "https://mainnet-rpc.splendor.org/"
const chainId = 2691
const from = "0xPayer" // wallet.address
const to = "0xPayTo"
const asset = "0x0000000000000000000000000000000000000000" // SPLD
const value = "0x9184e72a000" // 0.0001 SPLD (wei)
const now = Math.floor(Date.now()/1000)
const validAfter = now
const validBefore = now + 300
const nonce = "0x" + Buffer.from(ethers.randomBytes(32)).toString("hex")

const message = `x402-payment:${from}:${to}:${value}:${validAfter}:${validBefore}:${nonce}:${asset}:${chainId}`
const signature = await wallet.signMessage(message)

const payment = {
  x402Version: 1,
  scheme: "exact",
  network: "splendor",
  payload: { from, to, value, validAfter, validBefore, nonce, asset, signature }
}

// Verify
await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', method: 'x402_verify', params: [requirements, payment], id: 1 })
})

// Settle
await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', method: 'x402_settle', params: [requirements, payment], id: 2 })
})
```

---

## 11) Troubleshooting

- `Invalid signature`: confirm message exactness (addresses, 0x hex, chainId). Ensure EIP‑191 prefix is used by the wallet.
- `Payment expired` / `not yet valid`: sync system clock; check validity window.
- `Insufficient balance` / `allowance`: fund wallet or call `approve` / add `permit`.
- Permit reverts: token may use nonstandard domain/version; fall back to `approve` or adjust typed data.
- ERC‑20 transfer failed: token may revert on `transferFrom`; inspect revert reason/logs.

---

## 12) Appendix — Multi‑Asset Offers (accepts array)

You can offer multiple assets/currencies in one 402 response:

```json
{
  "x402Version": 1,
  "accepts": [
    { "scheme": "exact", "network": "splendor", "maxAmountRequired": "0x...", "resource": "/api/premium", "payTo": "0xYou", "maxTimeoutSeconds": 300, "asset": "0x0" },
    { "scheme": "exact", "network": "splendor", "maxAmountRequired": "0x2710", "resource": "/api/premium", "payTo": "0xYou", "maxTimeoutSeconds": 300, "asset": "0xUSDC..." }
  ]
}
```

Clients choose an entry, sign the message with the corresponding `asset` and `value`, and proceed.
