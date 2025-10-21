const { ethers } = require("ethers");

// Your private key here - replace with your actual private key
const privateKey = "YOUR_PRIVATE_KEY_HERE";
const wallet = new ethers.Wallet(privateKey);

// x402 domain (adjust if needed)
const domain = {
  name: "x402",
  version: "1",
  chainId: 2691,  // your Splendor net_version
  verifyingContract: "0x0000000000000000000000000000000000000000"
};

// Types (x402 payload structure, simplified)
const types = {
  Payload: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
    { name: "asset", type: "address" }
  ]
};

// Example payload (replace values if you want)
const now = Math.floor(Date.now() / 1000);
const payload = {
  from: "0x0000000000000000000000000000000000000001",
  to:   "0x0000000000000000000000000000000000000001",
  value: "0x1",
  validAfter: now,
  validBefore: now + 300,
  nonce: "0x1111111111111111111111111111111111111111111111111111111111111111",
  asset: "0x0000000000000000000000000000000000000000"
};

(async () => {
  try {
    console.log("Wallet address:", wallet.address);
    console.log("Payload:", JSON.stringify(payload, null, 2));
    
    const signature = await wallet._signTypedData(domain, types, payload);
    console.log("Signature:", signature);
    
    // Also output the complete PAY object for easy copy-paste
    const payObject = {
      x402Version: 1,
      scheme: "exact",
      network: "splendor",
      payload: {
        ...payload,
        signature: signature
      }
    };
    
    console.log("\nComplete PAY object:");
    console.log(JSON.stringify(payObject, null, 2));
    
    // Output shell variable format
    console.log("\nFor shell usage:");
    console.log(`PAY='${JSON.stringify(payObject)}'`);
    
  } catch (error) {
    console.error("Error:", error);
  }
})();
