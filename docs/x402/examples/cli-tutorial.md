# x402 CLI Tutorial (cURL + one-liners)

This tutorial shows how to test x402 payments using simple cURL commands and small one-liners for signing.

Prereqs: Node.js or Python for signing; an RPC: `https://mainnet-rpc.splendor.org/`

## 1) Check x402 support
```bash
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"x402_supported","params":[],"id":1}' \
  https://mainnet-rpc.splendor.org/
```

## 2) Build requirements
```bash
REQ='{"scheme":"exact","network":"splendor","maxAmountRequired":"0x9184e72a000","resource":"/api/premium","description":"Payment required","mimeType":"application/json","payTo":"0xYourReceiver","maxTimeoutSeconds":300,"asset":"0x0000000000000000000000000000000000000000"}'
```

## 3) Create and sign x402 message

Fill these in:
```bash
FROM=0xPayer
TO=0xYourReceiver
ASSET=0x0000000000000000000000000000000000000000
VALUE=0x9184e72a000
CHAINID=2691
NOW=$(date +%s)
VALID_AFTER=$NOW
VALID_BEFORE=$((NOW+300))
NONCE=0x$(openssl rand -hex 32)
MESSAGE="x402-payment:${FROM}:${TO}:${VALUE}:${VALID_AFTER}:${VALID_BEFORE}:${NONCE}:${ASSET}:${CHAINID}"
```

Sign in Node.js (ephemeral one-liner):
```bash
node -e "const {Wallet}=require('ethers');const w=new Wallet(process.env.PK);(async()=>{const s=await w.signMessage(process.env.MSG);console.log(s)})()" \
  MSG="$MESSAGE" PK=$PRIVATE_KEY > sig.txt
SIG=$(cat sig.txt)
```

Or sign in Python:
```bash
python3 - << 'PY'
from eth_account import Account
from eth_account.messages import encode_defunct
import os
msg=os.environ['MSG']
pk=os.environ['PK']
acct=Account.from_key(pk)
message=encode_defunct(text=msg)
signed=acct.sign_message(message)
print(signed.signature.hex())
PY
```

## 4) Build payload JSON
```bash
PAY=$(jq -cn --arg from "$FROM" --arg to "$TO" --arg value "$VALUE" --argjson va $VALID_AFTER --argjson vb $VALID_BEFORE --arg nonce "$NONCE" --arg asset "$ASSET" --arg sig "$SIG" '{x402Version:1,scheme:"exact",network:"splendor",payload:{from:$from,to:$to,value:$value,validAfter:$va,validBefore:$vb,nonce:$nonce,asset:$asset,signature:$sig}}')
```

## 5) Verify
```bash
curl -s -X POST -H "Content-Type: application/json" \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"x402_verify\",\"params\":[${REQ},${PAY}],\"id\":2}" \
  https://mainnet-rpc.splendor.org/
```

## 6) Settle
```bash
curl -s -X POST -H "Content-Type: application/json" \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"x402_settle\",\"params\":[${REQ},${PAY}],\"id\":3}" \
  https://mainnet-rpc.splendor.org/
```

If success, you’ll get `txHash`, and the receiver’s balance will reflect the transfer.

