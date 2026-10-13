import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { createApp } from '../server/index.mjs'
import { cleanPhoto } from '../server/photos.mjs'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const buyer = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
const payout = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
const meals = new Map()
let nextId = 1
let interruptServe = false
let serveCalls = 0
const fakeChain = {
  paymentHash: () => 'a'.repeat(64),
  confirmedPayment: async (link) => link && !link.endsWith('unconfirmed') ? { link, createdAt: Math.floor(Date.now() / 1000) } : null,
  stellarConfig: () => ({ network: 'testnet', contractId: 'test-contract', tokenId: 'test-token' }),
  latestLedger: async () => 1,
  ledgerTime: async () => Math.floor(Date.now() / 1000),
  getStall: async () => ({ price: 30_000_000 }),
  mealTotals: async () => ({ bought: meals.size, served: [...meals.values()].filter((meal) => meal.status === 'Served').length, returned: 0, waiting: [...meals.values()].filter((meal) => meal.status === 'Waiting').length, paidCents: 300, returnedCents: 0 }),
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
  serve: async ({ mealId, onSubmitted }) => {
    serveCalls++
    const meal = meals.get(Number(mealId)); meal.status = 'Served'
    const result = { hash: 'e'.repeat(64), link: 'https://stellar.expert/explorer/testnet/tx/e' }
    onSubmitted?.(result)
    if (interruptServe) { interruptServe = false; throw new Error('test_interruption') }
    return result
  },
  refund: async (mealId) => { const meal = meals.get(Number(mealId)); meal.status = 'Returned'; return { hash: 'f'.repeat(64), link: 'https://stellar.expert/explorer/testnet/tx/f' } },
  keepAlive: async () => ({ hash: '1'.repeat(64), link: 'https://stellar.expert/explorer/testnet/tx/1' }),
  validAddress: () => true,
  mintPlayUsdc: async () => ({ hash: '2'.repeat(64), link: 'https://stellar.expert/explorer/testnet/tx/2' }),
  tokenBalance: async () => 100_000_000,
}
let current = {}
const photoDirectory = mkdtempSync(join(tmpdir(), 'pendiente-smoke-'))
const database = new Database(':memory:')
let app = createApp({ db: database, chain: fakeChain, photoDirectory })
let server = app.listen(0, '127.0.0.1')
await new Promise((resolve) => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const request = async (path, options) => { const response = await fetch(base + path, { ...options, headers: { 'content-type': 'application/json', connection: 'close', ...(options?.headers || {}) } }); return { status: response.status, body: await response.json() } }
const fingerprint = (value) => createHash('sha256').update(value).digest('hex')
const secret = '11'.repeat(32)
const secretFingerprint = fingerprint(Buffer.from(secret, 'hex'))
const backupCode = 'ABCD2345EFGH6789'
const backupPreimage = fingerprint(Buffer.from(`pendiente-backup-v1:${backupCode}`))
const backupFingerprint = fingerprint(Buffer.from(backupPreimage, 'hex'))
current = { fingerprint: secretFingerprint, backupFingerprint }

try {
  assert.throws(() => cleanPhoto(`data:image/jpeg;base64,${Buffer.from([255,216,255,218,255,217]).toString('base64')}`), /photo_too_large_or_not_a_photo/)
  const chunk = (name) => { const bytes = Buffer.alloc(12); bytes.write(name, 4); return bytes }
  const fakePng = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IDAT'), chunk('IEND')])
  assert.throws(() => cleanPhoto(`data:image/png;base64,${fakePng.toString('base64')}`), /photo_too_large_or_not_a_photo/)
  const fakeWebp = Buffer.alloc(20); fakeWebp.write('RIFF'); fakeWebp.writeUInt32LE(12, 4); fakeWebp.write('WEBP', 8); fakeWebp.write('VP8 ', 12)
  assert.throws(() => cleanPhoto(`data:image/webp;base64,${fakeWebp.toString('base64')}`), /photo_too_large_or_not_a_photo/)
  const prepared = await request('/api/meals/prepare', { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', buyer, fingerprint: secretFingerprint, backupFingerprint }) })
  if (prepared.status !== 400) throw new Error(`unregistered stall accepted: ${JSON.stringify(prepared.body)}`)
  app.locals.db.prepare('UPDATE stalls SET chain_stall_id=1,payout_address=? WHERE id=?').run(payout, 'iya-basiras-buka')
  const ready = await request('/api/meals/prepare', { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', buyer, fingerprint: secretFingerprint, backupFingerprint }) })
  if (ready.status !== 200) throw new Error(`prepare failed: ${JSON.stringify(ready.body)}`)
  const created = await request('/api/meals/submit', { method: 'POST', body: JSON.stringify({ signedXdr: ready.body.xdr, firstName: 'Smoke', message: '', email: '' }) })
  if (created.status !== 201) throw new Error(`submit failed: ${JSON.stringify(created.body)}`)
  const id = created.body.id
  const wrongStall = await request('/api/counter/check', { method: 'POST', body: JSON.stringify({ stallId: 'other-stall', mealId: id, backupCode }) })
  assert.equal(wrongStall.status, 403)
  const earlyReturn = await request(`/api/meals/${id}/refund`, { method: 'POST', body: '{}' })
  assert.equal(earlyReturn.status, 409)
  const wrong = await request('/api/counter/check', { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', mealId: id, backupCode: 'WRONGWRONGWRONG00' }) })
  if (wrong.status !== 401) throw new Error('wrong code accepted')
  for (let attempt = 0; attempt < 10; attempt++) assert.equal((await request('/api/counter/check', { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', mealId: id, backupCode: 'WRONGWRONGWRONG00' }) })).status, 401)
  const badPhoto = await request(`/api/meals/${id}/serve`, { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', secret, photoData: 'data:image/jpeg;base64,ZmFrZQ==' }) })
  assert.equal(badPhoto.status, 413)
  const largePhoto = await request(`/api/meals/${id}/serve`, { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', secret, photoData: `data:image/jpeg;base64,${'A'.repeat(20 * 1024 * 1024)}` }) })
  assert.equal(largePhoto.status, 413)
  const checked = await request('/api/counter/check', { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', mealId: id, backupCode }) })
  if (checked.status !== 200) throw new Error(`backup check failed: ${JSON.stringify(checked.body)}`)
  const served = await request(`/api/meals/${id}/serve`, { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', backupCode }) })
  if (served.status !== 200 || served.body.status !== 'Served') throw new Error(`serve failed: ${JSON.stringify(served.body)}`)
  const second = await request(`/api/meals/${id}/serve`, { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', backupCode }) })
  if (second.status !== 409) throw new Error('second serve accepted')
  assert.equal((await request(`/api/meals/${id}/refund`, { method: 'POST', body: '{}' })).status, 409)
  const publicMeal = await request(`/api/meals/${id}`)
  if (/fingerprint|secret|backup/i.test(JSON.stringify(publicMeal.body))) throw new Error('public meal exposed card data')
  const nonAdmin = await request('/api/admin/stalls', { method: 'POST', body: JSON.stringify({ name: 'No key', city: 'Lagos', address: 'Nowhere', priceCents: 300, payoutAddress: payout }) })
  if (nonAdmin.status !== 401) throw new Error('non-admin add accepted')
  const proof = await request('/api/proof')
  if (!Array.isArray(proof.body.items) || proof.body.items.length !== 1) throw new Error('proof response is not private and paginated')
  assert.equal(proof.body.items[0].firstNameInitial, 'S.')
  assert.equal('firstName' in proof.body.items[0], false)
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
  const marker = Buffer.from('GPS: TEST LOCATION')
  const textChunk = Buffer.alloc(marker.length + 12); textChunk.writeUInt32BE(marker.length); textChunk.write('tEXt', 4); marker.copy(textChunk, 8)
  const tagged = Buffer.concat([pixel.subarray(0, 33), textChunk, pixel.subarray(33)])
  assert.equal(cleanPhoto(`data:image/png;base64,${tagged.toString('base64')}`).bytes.includes(marker), false)
  await request('/api/meals/prepare', { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', buyer, fingerprint: secretFingerprint, backupFingerprint }) })
  const recoveryMeal = await request('/api/meals/submit', { method: 'POST', body: JSON.stringify({ signedXdr: 'smoke-xdr', firstName: 'Retry' }) })
  interruptServe = true
  const interrupted = await request(`/api/meals/${recoveryMeal.body.id}/serve`, { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', secret, photoData: `data:image/png;base64,${tagged.toString('base64')}` }) })
  assert.equal(interrupted.status, 502)
  const listenPort = server.address().port
  await new Promise((resolve) => server.close(resolve))
  app = createApp({ db: database, chain: fakeChain, photoDirectory })
  server = app.listen(listenPort, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  await app.locals.reconcile()
  const callsBeforeRetry = serveCalls
  const recovered = await request(`/api/meals/${recoveryMeal.body.id}/serve`, { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', secret }) })
  assert.equal(recovered.status, 200)
  assert.equal(recovered.body.status, 'Served')
  assert.ok(recovered.body.servedAt)
  assert.ok(recovered.body.photoUrl)
  assert.equal(serveCalls, callsBeforeRetry, 'Recovered serve must not send money again')
  database.prepare('UPDATE meals SET serve_tx=? WHERE id=?').run('https://stellar.expert/explorer/testnet/tx/unconfirmed', id)
  assert.equal((await request(`/api/meals/${id}`)).body.serveLink, undefined, 'Unconfirmed links must not be public')
  console.log(JSON.stringify({ ok: true, checks: ['chain stall required', 'prepare and signed submit', '80-bit backup match', 'ten wrong codes refused', 'wrong stall refused', 'early and late invalid returns refused', 'serve once', 'second serve refused', 'public card data hidden', 'private proof list', '20 MB upload refused', 'fake JPEG and PNG refused', 'location metadata stripped', 'server restart recovers photo and date without second payment'] }))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  server.close()
  app.locals.db.close()
}
