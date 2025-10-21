const { ethers } = require("ethers");
const https = require("https");
const http = require("http");

// Configuration
const RPC_URL = "https://mainnet-rpc.splendor.org/";
const PRIVATE_KEY = "YOUR_PRIVATE_KEY_HERE"; // Replace with your actual private key

// Create wallet
const wallet = new ethers.Wallet(PRIVATE_KEY);

// X402 uses EIP-191 message signing, not EIP-712
// Message format: x402-payment:from:to:valueHex:validAfter:validBefore:nonceHex:assetHex:chainId
const CHAIN_ID = 2691;  // Splendor chain ID

// Helper function to make RPC calls
function makeRPCCall(method, params, id = 1) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      jsonrpc: "2.0",
      method: method,
      params: params,
      id: id
    });

    const url = new URL(RPC_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  try {
    console.log("🚀 Starting X402 Payment Flow Test");
    console.log("=====================================");
    console.log(`Wallet Address: ${wallet.address}`);
    console.log(`RPC Endpoint: ${RPC_URL}`);
    console.log("");

    // Step 1: Create payload
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      from: wallet.address,  // Use the actual wallet address that will sign
      to: wallet.address,    // Use the actual wallet address as recipient (self-payment for testing)
      value: "0x1",
      validAfter: now,
      validBefore: now + 300,
      nonce: "0x1111111111111111111111111111111111111111111111111111111111111111",
      asset: "0x0000000000000000000000000000000000000000"
    };

    console.log("📝 Step 1: Creating X402 Payload");
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.log("");

    // Step 2: Sign the payload with EIP-191 message format
    console.log("✍️  Step 2: Signing Payload with EIP-191");
    
    // Build the message in the exact format expected by the blockchain
    const message = `x402-payment:${payload.from}:${payload.to}:${payload.value}:${payload.validAfter}:${payload.validBefore}:${payload.nonce}:${payload.asset}:${CHAIN_ID}`;
    console.log(`Message to sign: ${message}`);
    
    // Sign with EIP-191 prefix (personal_sign format)
    const signature = await wallet.signMessage(message);
    console.log(`Signature: ${signature}`);
    console.log("");

    // Step 3: Create REQ and PAY objects
    const REQ = {
      scheme: "exact",
      network: "splendor",
      maxAmountRequired: "0x1",
      resource: "self-test",
      description: "self-test",
      mimeType: "application/json",
      payTo: wallet.address,  // Use the actual wallet address for payment
      maxTimeoutSeconds: 300,
      asset: "0x0000000000000000000000000000000000000000"
    };

    const PAY = {
      x402Version: 1,
      scheme: "exact",
      network: "splendor",
      payload: {
        ...payload,
        signature: signature
      }
    };

    console.log("📋 Step 3: Creating REQ and PAY Objects");
    console.log("REQ:", JSON.stringify(REQ, null, 2));
    console.log("PAY:", JSON.stringify(PAY, null, 2));
    console.log("");

    // Step 4: Test x402_verify
    console.log("🔍 Step 4: Testing x402_verify");
    try {
      const verifyResponse = await makeRPCCall("x402_verify", [REQ, PAY], 3);
      console.log("Verify Response:", JSON.stringify(verifyResponse, null, 2));
      
      if (verifyResponse.result && verifyResponse.result.isValid) {
        console.log("✅ Signature verification PASSED!");
      } else {
        console.log("❌ Signature verification FAILED!");
        if (verifyResponse.error) {
          console.log("Error:", verifyResponse.error);
        }
      }
    } catch (error) {
      console.log("❌ x402_verify failed:", error.message);
    }
    console.log("");

    // Step 5: Test x402_settle
    console.log("💰 Step 5: Testing x402_settle");
    try {
      const settleResponse = await makeRPCCall("x402_settle", [REQ, PAY], 4);
      console.log("Settle Response:", JSON.stringify(settleResponse, null, 2));
      
      if (settleResponse.result) {
        console.log("✅ Settlement SUCCESSFUL!");
        if (settleResponse.result.txHash) {
          console.log(`Transaction Hash: ${settleResponse.result.txHash}`);
        }
      } else {
        console.log("❌ Settlement FAILED!");
        if (settleResponse.error) {
          console.log("Error:", settleResponse.error);
        }
      }
    } catch (error) {
      console.log("❌ x402_settle failed:", error.message);
    }
    console.log("");

    console.log("🎉 X402 Payment Flow Test Complete!");
    console.log("=====================================");

  } catch (error) {
    console.error("💥 Error in main flow:", error);
  }
}

// Run the test
main().catch(console.error);
