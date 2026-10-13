import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { Keypair, Networks, TransactionBuilder, rpc } from '@stellar/stellar-sdk'

const site = process.env.E2E_SITE || 'https://pendiente.54-154-121-30.sslip.io'
const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org', { timeout: 30_000 })
const buyer = Keypair.random() // Throwaway testnet key stays in memory.
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const api = async (path, body) => {
  const response = await fetch(site + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120_000) })
  const result = await response.json()
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(result)}`)
  return result
}
const health = await api('/api/health')
assert.equal(health.network, 'testnet')
const friendbot = await fetch(`https://friendbot.stellar.org?addr=${buyer.publicKey()}`, { signal: AbortSignal.timeout(60_000) })
assert.equal(friendbot.ok, true, 'Friendbot must fund the throwaway buyer')
const trust = await api('/api/practice/trust/prepare', { address: buyer.publicKey() })
const trustTx = TransactionBuilder.fromXDR(trust.xdr, Networks.TESTNET)
trustTx.sign(buyer)
console.log('trust', (await api('/api/practice/trust/submit', { signedXdr: trustTx.toXDR() })).link)
console.log('fund', (await api('/api/practice/fund', { address: buyer.publicKey() })).link)
const { result: settings } = await rpcServer.queryContract(health.contract, 'get_settings', {}, Networks.TESTNET)
const balance = async (address) => (await rpcServer.queryContract(settings.usdc, 'balance', { id: address }, Networks.TESTNET)).result
const stall = (await api('/api/stalls'))[0]
assert.ok(stall, 'A registered demo stall is required')

async function buy() {
  const secret = randomBytes(32).toString('hex')
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const backupCode = [...randomBytes(16)].map((byte) => alphabet[byte % 32]).join('')
  const backupPreimage = digest(Buffer.from(`pendiente-backup-v1:${backupCode}`))
  const prepared = await api('/api/meals/prepare', { stallId: stall.id, buyer: buyer.publicKey(), fingerprint: digest(Buffer.from(secret, 'hex')), backupFingerprint: digest(Buffer.from(backupPreimage, 'hex')) })
  const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET)
  tx.sign(buyer)
  const meal = await api('/api/meals/submit', { signedXdr: tx.toXDR(), firstName: 'Test', message: '', email: '' })
  assert.equal(meal.status, 'Waiting')
  console.log('buy', meal.paymentLink)
  return { meal, secret, backupCode }
}

const first = await buy()
const { result: chainMeal } = await rpcServer.queryContract(health.contract, 'get_meal', { meal_id: BigInt(first.meal.id.replace('meal-', '')) }, Networks.TESTNET)
const payoutBefore = await balance(chainMeal.payout)
const served = await api(`/api/meals/${first.meal.id}/serve`, { stallId: stall.id, secret: first.secret })
assert.equal(served.status, 'Served')
assert.equal(await balance(chainMeal.payout) - payoutBefore, BigInt(first.meal.amountCents) * 100_000n)
console.log('QR serve', served.serveLink)
const second = await buy()
const backupServed = await api(`/api/meals/${second.meal.id}/serve`, { stallId: stall.id, backupCode: second.backupCode.match(/.{4}/g).join('-').toLowerCase() })
assert.equal(backupServed.status, 'Served')
console.log('backup serve', backupServed.serveLink)

const beforeReturn = await balance(buyer.publicKey())
const third = await buy()
console.log('Waiting for the 120-second expiry and automatic return')
let returned
for (let attempt = 0; attempt < 30; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 10_000))
  returned = await api(`/api/meals/${third.meal.id}`)
  if (returned.status === 'Returned') break
}
assert.equal(returned.status, 'Returned')
assert.equal(await balance(buyer.publicKey()), beforeReturn)
assert.ok(returned.refundLink)
console.log('automatic return', returned.refundLink)

const fourth = await buy()
const wrong = await fetch(site + '/api/counter/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stallId: stall.id, mealId: fourth.meal.id, backupCode: 'AAAAAAAAAAAAAAAA' }) })
assert.equal(wrong.status, 401)
assert.equal((await api(`/api/meals/${fourth.meal.id}`)).status, 'Waiting')
console.log('Wrong code refused; meal remains Waiting')
console.log('PASS: QR serve, backup serve, automatic return, wrong code refusal')
