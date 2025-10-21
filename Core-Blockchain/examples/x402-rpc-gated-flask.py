"""
Example: Pure RPC-gated Flask server using Splendor native x402

Run:
  export X402_PAYTO=0xYourReceiver
  python3 Core-Blockchain/examples/x402-rpc-gated-flask.py
"""

import os
import json
import base64
import requests
from flask import Flask, request, jsonify

RPC_URL = os.environ.get("X402_RPC_URL") or os.environ.get("SPLENDOR_RPC") or "https://mainnet-rpc.splendor.org/"
PAY_TO = (os.environ.get("X402_PAYTO") or "").strip()
ASSET = (os.environ.get("X402_ASSET") or "0x0000000000000000000000000000000000000000").strip()
MAX_AMOUNT_REQUIRED_HEX = (os.environ.get("X402_MAX_AMOUNT_HEX") or "0x9184e72a000").strip()  # ~0.0001 18-dec
NETWORK = os.environ.get("X402_NETWORK") or "splendor"
MAX_TIMEOUT_SECONDS = int(os.environ.get("X402_MAX_TIMEOUT") or "300")

if not PAY_TO:
    raise SystemExit("X402_PAYTO is required (receiver address)")

app = Flask(__name__)


def rpc_call(method, params, id=1):
    payload = {"jsonrpc": "2.0", "method": method, "params": params, "id": id}
    r = requests.post(RPC_URL, json=payload, headers={"Content-Type": "application/json"}, timeout=30)
    r.raise_for_status()
    data = r.json()
    if "error" in data and data["error"]:
        raise RuntimeError(str(data["error"]))
    return data.get("result")


@app.route("/api/premium", methods=["GET"])
def premium():
    payment_header = request.headers.get("X-Payment")
    if not payment_header:
        requirements = {
            "scheme": "exact",
            "network": NETWORK,
            "maxAmountRequired": MAX_AMOUNT_REQUIRED_HEX,
            "resource": "/api/premium",
            "description": "Payment required for /api/premium",
            "mimeType": "application/json",
            "payTo": PAY_TO,
            "maxTimeoutSeconds": MAX_TIMEOUT_SECONDS,
            "asset": ASSET,
        }
        return jsonify({"x402Version": 1, "accepts": [requirements]}), 402

    try:
        payment = json.loads(base64.b64decode(payment_header).decode("utf-8"))
    except Exception:
        return jsonify({"error": "Invalid X-Payment header"}), 400

    requirements = {
        "scheme": "exact",
        "network": NETWORK,
        "maxAmountRequired": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        "resource": "/api/premium",
        "description": "Payment required for /api/premium",
        "mimeType": "application/json",
        "payTo": PAY_TO,
        "maxTimeoutSeconds": MAX_TIMEOUT_SECONDS,
        "asset": ASSET,
    }
    try:
        verify = rpc_call("x402_verify", [requirements, payment], 2001)
        if not verify or not verify.get("isValid"):
            return jsonify({"error": "Payment invalid", "details": verify and verify.get("invalidReason")}), 402

        settle_req = dict(requirements)
        settle_req["maxAmountRequired"] = MAX_AMOUNT_REQUIRED_HEX
        settle = rpc_call("x402_settle", [settle_req, payment], 2002)
        if not settle or not settle.get("success"):
            return jsonify({"error": "Payment settlement failed", "details": settle and settle.get("error")}), 402

        resp_hdr = base64.b64encode(json.dumps({
            "success": True,
            "txHash": settle.get("txHash"),
            "networkId": settle.get("networkId") or NETWORK,
        }).encode("utf-8")).decode("utf-8")

        out = jsonify({
            "message": "Premium content",
            "payment": {
                "payer": verify.get("payerAddress"),
                "txHash": settle.get("txHash"),
                "networkId": settle.get("networkId") or NETWORK,
            }
        })
        out.headers["X-Payment-Response"] = resp_hdr
        return out
    except Exception as e:
        return jsonify({"error": "Internal error", "details": str(e)}), 500


@app.route("/api/free", methods=["GET"])
def free():
    return jsonify({"message": "Free endpoint (no payment required)"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT") or os.environ.get("X402_EXAMPLE_PORT") or "3011")
    print("Starting Flask x402 RPC-gated example on port", port)
    print("Config:", {"RPC_URL": RPC_URL, "PAY_TO": PAY_TO, "ASSET": ASSET, "MAX_AMOUNT_REQUIRED_HEX": MAX_AMOUNT_REQUIRED_HEX, "NETWORK": NETWORK})
    app.run(host="0.0.0.0", port=port)

