import {
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
} from '@stellar/stellar-sdk'

const enabled = process.env.STELLAR_ENABLED === 'true'
const network = process.env.STELLAR_NETWORK || 'testnet'
const networkPassphrase = network === 'public' ? Networks.PUBLIC : Networks.TESTNET
const rpcUrl = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org'
const contractId = process.env.STELLAR_CONTRACT_ID || ''
const tokenId = process.env.STELLAR_TOKEN_CONTRACT_ID || ''
const serverSecret = process.env.STELLAR_SERVER_SECRET || ''
const serverKeypair = serverSecret ? Keypair.fromSecret(serverSecret) : null
const rpcServer = new rpc.Server(rpcUrl, { timeout: 30_000 })

if (enabled && network === 'testnet' && !serverSecret) {
  throw new Error('Pendiente needs STELLAR_SERVER_SECRET to start on testnet')
}
if (enabled && network !== 'testnet') throw new Error('Only testnet is supported')

const txLink = (hash) => `https://stellar.expert/explorer/${network === 'public' ? 'public' : 'testnet'}/tx/${hash}`
const contract = () => new Contract(contractId)
const token = () => new Contract(tokenId)
const address = (value) => nativeToScVal(String(value), { type: 'address' })
const u64 = (value) => nativeToScVal(BigInt(value), { type: 'u64' })
const u32 = (value) => nativeToScVal(Number(value), { type: 'u32' })
const i128 = (value) => nativeToScVal(BigInt(value), { type: 'i128' })
const bytes = (value) => nativeToScVal(Uint8Array.from(Buffer.from(String(value), 'hex')), { type: 'bytes' })

function ready() {
  if (!enabled) return false
  if (!contractId || !serverKeypair) throw new Error('stellar_not_configured')
  return true
}

export function stellarIsEnabled() { return ready() }
export function stellarConfig() { return { enabled, network, contractId, tokenId, rpcUrl } }

async function prepared(source, operation) {
  const account = await rpcServer.getAccount(source)
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(operation)
    .setTimeout(30)
    .build()
  return rpcServer.prepareTransaction(tx)
}

async function send(preparedTx) {
  if (!serverKeypair) throw new Error('stellar_server_secret_missing')
  preparedTx.sign(serverKeypair)
  const sent = await rpcServer.sendTransaction(preparedTx)
  if (sent.status !== 'PENDING') throw new Error(`stellar_send_${String(sent.status).toLowerCase()}`)
  const final = await rpcServer.pollTransaction(sent.hash, { attempts: 40 })
  if (final.status !== 'SUCCESS') throw new Error(`stellar_result_${String(final.status).toLowerCase()}`)
  return { hash: sent.hash, link: txLink(sent.hash), result: final }
}

async function sendFor(source, operation) {
  const run = sendQueue.catch(() => {}).then(async () => send(await prepared(source, operation)))
  sendQueue = run
  return run
}
let sendQueue = Promise.resolve()

export function paymentHash(signedXdr) {
  return Buffer.from(TransactionBuilder.fromXDR(signedXdr, networkPassphrase).hash()).toString('hex')
}

export async function prepareBuy({ buyer, stallId, fingerprint, backupFingerprint }) {
  if (!ready()) return null
  const tx = await prepared(buyer, contract().call('buy', address(buyer), u32(stallId), bytes(fingerprint), bytes(backupFingerprint)))
  const hash = Buffer.from(tx.hash()).toString('hex')
  return { xdr: tx.toXDR(), hash, link: txLink(hash) }
}

export async function submitBuy({ signedXdr }) {
  if (!ready()) return null
  const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase)
  const sent = await rpcServer.sendTransaction(tx)
  if (!['PENDING', 'DUPLICATE'].includes(sent.status)) throw new Error(`stellar_send_${String(sent.status).toLowerCase()}`)
  const final = await rpcServer.pollTransaction(sent.hash, { attempts: 40 })
  if (final.status !== 'SUCCESS') throw new Error(`stellar_result_${String(final.status).toLowerCase()}`)
  let mealId
  if (final.returnValue) {
    const value = scValToNative(final.returnValue)
    mealId = Number(typeof value === 'bigint' ? value : value?.value ?? value)
  }
  return { hash: sent.hash, link: txLink(sent.hash), mealId, result: final }
}

function normalizeStatus(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'tag' in value) return value.tag
  return String(value)
}

function normalizeMeal(value) {
  if (!value) return null
  return {
    ...value,
    meal_id: Number(value.meal_id ?? value.id),
    stall_id: Number(value.stall_id),
    amount: Number(value.amount),
    bought_at: Number(value.bought_at),
    expires_at: Number(value.expires_at),
    status: normalizeStatus(value.status),
    fingerprint: value.fingerprint instanceof Uint8Array ? Buffer.from(value.fingerprint).toString('hex') : value.fingerprint,
    backup_fingerprint: value.backup_fingerprint instanceof Uint8Array ? Buffer.from(value.backup_fingerprint).toString('hex') : value.backup_fingerprint,
  }
}

export async function getMeal(mealId) {
  if (!ready()) return null
  const { result } = await rpcServer.queryContract(contractId, 'get_meal', { meal_id: BigInt(mealId) }, networkPassphrase)
  return normalizeMeal(result)
}

export async function getStall(stallId) {
  if (!ready()) return null
  const { result: value } = await rpcServer.queryContract(contractId, 'get_stall', { stall_id: Number(stallId) }, networkPassphrase)
  if (!value) return null
  return { ...value, stall_id: Number(value.stall_id), price: Number(value.price), active: Boolean(value.active) }
}

export async function getSettings() {
  if (!ready()) return null
  const { result: value } = await rpcServer.queryContract(contractId, 'get_settings', {}, networkPassphrase)
  return value ? { ...value, next_meal: Number(value.next_meal), refund_seconds: Number(value.refund_seconds) } : null
}

export async function nextMealId() {
  if (!ready()) return null
  const { result } = await rpcServer.queryContract(contractId, 'next_meal_id', {}, networkPassphrase)
  return Number(result)
}

export async function tokenBalance(owner) {
  if (!ready() || !tokenId) return 0
  const { result: value } = await rpcServer.queryContract(tokenId, 'balance', { id: owner }, networkPassphrase)
  return Number(value ?? 0)
}
export async function hasTrustline(owner) {
  if (!validAddress(owner)) return false
  const { result: issuer } = await rpcServer.queryContract(tokenId, 'admin', {}, networkPassphrase)
  if (owner === issuer) return true
  const response = await fetch(`https://horizon-testnet.stellar.org/accounts/${owner}`, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) return false
  return (await response.json()).balances.some((balance) => balance.asset_code === 'USDC' && balance.asset_issuer === issuer)
}
export async function prepareTrust(owner) {
  ready()
  return { xdr: (await prepared(owner, token().call('trust', address(owner)))).toXDR() }
}
export async function submitTrust(signedXdr) {
  const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase)
  if (tx.operations.length !== 1) throw new Error('invalid_payment')
  const sent = await rpcServer.sendTransaction(tx)
  if (!['PENDING', 'DUPLICATE'].includes(sent.status)) throw new Error('payment_not_sent')
  const final = await rpcServer.pollTransaction(sent.hash, { attempts: 40 })
  if (final.status !== 'SUCCESS') throw new Error('payment_not_sent')
  return { hash: sent.hash, link: txLink(sent.hash) }
}

export async function serve({ mealId, preimage }) {
  if (!ready()) return null
  try {
    return await sendFor(serverKeypair.publicKey(), contract().call('serve', u64(mealId), bytes(preimage)))
  } catch (error) {
    const meal = await getMeal(mealId).catch(() => null)
    if (meal?.status === 'Served') return { reconciled: true }
    throw error
  }
}

export async function refund(mealId) {
  if (!ready()) return null
  try {
    return await sendFor(serverKeypair.publicKey(), contract().call('refund', u64(mealId)))
  } catch (error) {
    const meal = await getMeal(mealId).catch(() => null)
    if (meal?.status === 'Returned') return { reconciled: true }
    throw error
  }
}

export async function keepAlive(mealId) {
  if (!ready()) return null
  return sendFor(serverKeypair.publicKey(), contract().call('keep_alive', u64(mealId)))
}

export async function addStall({ stallId, payout, price }) {
  if (!ready()) return null
  return sendFor(serverKeypair.publicKey(), contract().call('add_stall', u32(stallId), address(payout), i128(price), nativeToScVal(true, { type: 'bool' })))
}

export async function updateStall({ stallId, payout, price, active }) {
  if (!ready()) return null
  return sendFor(serverKeypair.publicKey(), contract().call('update_stall', u32(stallId), address(payout), i128(price), nativeToScVal(Boolean(active), { type: 'bool' })))
}

export async function fundPlayUsdc({ address: recipient, amount = 100_000_000n }) {
  if (!ready() || !tokenId) return null
  return sendFor(serverKeypair.publicKey(), token().call('mint', address(recipient), i128(amount)))
}

export const mintPlayUsdc = fundPlayUsdc

export async function latestLedger() {
  return (await rpcServer.getLatestLedger()).sequence
}
export async function ledgerTime() { return Number((await rpcServer.getLatestLedger()).closeTime) }

export function validAddress(value) { return StrKey.isValidEd25519PublicKey(String(value)) }

