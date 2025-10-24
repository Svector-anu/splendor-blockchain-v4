/**
 * Sign an EIP-2612 permit using ethers v6
 * Usage:
 *   node sign-permit-ethers.js \
 *     --rpc https://mainnet-rpc.splendor.org/ \
 *     --pk 0x... \
 *     --token 0xToken \
 *     --owner 0xOwner \
 *     --spender 0xSpender \
 *     --value 1000000 \
 *     --deadlineSec 3600
 */
import { ethers } from 'ethers'

function arg(name) {
  const i = process.argv.indexOf(name)
  return i>0 ? process.argv[i+1] : undefined
}

const RPC = arg('--rpc') || 'https://mainnet-rpc.splendor.org/'
const PK = arg('--pk')
const TOKEN = arg('--token')
const OWNER = arg('--owner')
const SPENDER = arg('--spender')
const VALUE = BigInt(arg('--value') || '0')
const DEADLINE_SEC = parseInt(arg('--deadlineSec') || '3600', 10)

if (!PK || !TOKEN || !OWNER || !SPENDER) {
  console.error('Missing required args. See header for usage.')
  process.exit(1)
}

const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(PK, provider)

const abi = [
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function nonces(address) view returns (uint256)'
]

async function main() {
  const erc20 = new ethers.Contract(TOKEN, abi, provider)
  const name = await erc20.name()
  let version = '1'
  try { version = await erc20.version() } catch {}
  const nonce = await erc20.nonces(OWNER)
  const deadline = BigInt(Math.floor(Date.now()/1000) + DEADLINE_SEC)

  const chainId = (await provider.getNetwork()).chainId

  const domain = { name, version, chainId, verifyingContract: TOKEN }
  const types = {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  }
  const message = { owner: OWNER, spender: SPENDER, value: VALUE, nonce, deadline }
  const sig = await wallet.signTypedData(domain, types, message)
  const split = ethers.Signature.from(sig)

  const out = {
    value: '0x' + VALUE.toString(16),
    deadline: '0x' + deadline.toString(16),
    v: split.v,
    r: split.r,
    s: split.s
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })

