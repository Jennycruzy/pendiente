import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { createApp } from '../server/index.mjs'

const buyer = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
const payout = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
const meals = new Map()
let nextId = 1
const fakeChain = {
  paymentHash: () => 'a'.repeat(64),
  stellarConfig: () => ({ network: 'testnet', contractId: 'test-contract', tokenId: 'test-token' }),
  latestLedger: async () => 1,
  ledgerTime: async () => Math.floor(Date.now() / 1000),
  getStall: async () => ({ price: 30_000_000 }),
  nextMealId: async () => nextId,
  prepareBuy: async ({ fingerprint, backupFingerprint, buyer: owner, stallId }) => ({ xdr: 'smoke-xdr', hash: 'a'.repeat(64), fingerprint, backupFingerprint, buyer: owner, stallId }),
  submitBuy: async () => {
    const id = nextId++
    const now = Math.floor(Date.now() / 1000)
    meals.set(id, { meal_id: id, stall_id: 1, buyer, payout, amount: 30_000_000, fingerprint: current.fingerprint, backup_fingerprint: current.backupFingerprint, bought_at: now, expires_at: now + 120, status: 'Waiting' })
    return { hash: 'a'.repeat(64), link: `https://stellar.expert/explorer/testnet/tx/${id}`, mealId: id }
  },
  getMeal: async (id) => meals.get(Number(id)) || null,
  addStall: async () => ({ hash: 'c'.repeat(64), link: 'https://stellar.expert/explorer/testnet/tx/c' }),
  updateStall: async () => ({ hash: 'd'.repeat(64), link: 'https://stellar.expert/explorer/testnet/tx/d' }),
  serve: async ({ mealId }) => { const meal = meals.get(Number(mealId)); meal.status = 'Served'; return { hash: 'e'.repeat(64), link: 'https://stellar.expert/explorer/testnet/tx/e' } },
  refund: async (mealId) => { const meal = meals.get(Number(mealId)); meal.status = 'Returned'; return { hash: 'f'.repeat(64), link: 'https://stellar.expert/explorer/testnet/tx/f' } },
  keepAlive: async () => ({ hash: '1'.repeat(64), link: 'https://stellar.expert/explorer/testnet/tx/1' }),
  validAddress: () => true,
  mintPlayUsdc: async () => ({ hash: '2'.repeat(64), link: 'https://stellar.expert/explorer/testnet/tx/2' }),
  tokenBalance: async () => 100_000_000,
}
let current = {}
const app = createApp({ db: new Database(':memory:'), chain: fakeChain })
const server = app.listen(0, '127.0.0.1')
await new Promise((resolve) => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const request = async (path, options) => { const response = await fetch(base + path, { headers: { 'content-type': 'application/json', ...(options?.headers || {}) }, ...options }); return { status: response.status, body: await response.json() } }
const fingerprint = (value) => createHash('sha256').update(value).digest('hex')
const secret = '11'.repeat(32)
const secretFingerprint = fingerprint(Buffer.from(secret, 'hex'))
const backupCode = 'ABCD2345EFGH6789'
const backupPreimage = fingerprint(Buffer.from(`pendiente-backup-v1:${backupCode}`))
const backupFingerprint = fingerprint(Buffer.from(backupPreimage, 'hex'))
current = { fingerprint: secretFingerprint, backupFingerprint }

try {
  const prepared = await request('/api/meals/prepare', { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', buyer, fingerprint: secretFingerprint, backupFingerprint }) })
  if (prepared.status !== 400) throw new Error(`unregistered stall accepted: ${JSON.stringify(prepared.body)}`)
  app.locals.db.prepare('UPDATE stalls SET chain_stall_id=1,payout_address=? WHERE id=?').run(payout, 'iya-basiras-buka')
  const ready = await request('/api/meals/prepare', { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', buyer, fingerprint: secretFingerprint, backupFingerprint }) })
  if (ready.status !== 200) throw new Error(`prepare failed: ${JSON.stringify(ready.body)}`)
  const created = await request('/api/meals/submit', { method: 'POST', body: JSON.stringify({ signedXdr: ready.body.xdr, firstName: 'Smoke', message: '', email: '' }) })
  if (created.status !== 201) throw new Error(`submit failed: ${JSON.stringify(created.body)}`)
  const id = created.body.id
  const wrong = await request('/api/counter/check', { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', mealId: id, backupCode: 'WRONGWRONGWRONG00' }) })
  if (wrong.status !== 401) throw new Error('wrong code accepted')
  const checked = await request('/api/counter/check', { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', mealId: id, backupCode }) })
  if (checked.status !== 200) throw new Error(`backup check failed: ${JSON.stringify(checked.body)}`)
  const served = await request(`/api/meals/${id}/serve`, { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', backupCode }) })
  if (served.status !== 200 || served.body.status !== 'Served') throw new Error(`serve failed: ${JSON.stringify(served.body)}`)
  const second = await request(`/api/meals/${id}/serve`, { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', backupCode }) })
  if (second.status !== 409) throw new Error('second serve accepted')
  const publicMeal = await request(`/api/meals/${id}`)
  if (/fingerprint|secret|backup/i.test(JSON.stringify(publicMeal.body))) throw new Error('public meal exposed card data')
  const nonAdmin = await request('/api/admin/stalls', { method: 'POST', body: JSON.stringify({ name: 'No key', city: 'Lagos', address: 'Nowhere', priceCents: 300, payoutAddress: payout }) })
  if (nonAdmin.status !== 401) throw new Error('non-admin add accepted')
  const proof = await request('/api/proof')
  if (!Array.isArray(proof.body.items) || proof.body.items.length !== 1) throw new Error('proof response is not private and paginated')
  console.log(JSON.stringify({ ok: true, checks: ['chain stall required', 'prepare and signed submit', '80-bit backup match', 'wrong code refused', 'serve once', 'second serve refused', 'public card data hidden', 'private proof list'] }))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  server.close()
  app.locals.db.close()
}
