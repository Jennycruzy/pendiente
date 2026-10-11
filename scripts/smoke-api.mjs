import { createHash, randomUUID } from 'node:crypto'

process.env.ADMIN_KEY ??= 'smoke-admin-key'
await import('../server/index.mjs')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const fingerprint = (value) => createHash('sha256').update(value).digest('hex')
const secretFingerprint = (value) => createHash('sha256').update(Buffer.from(value, 'hex')).digest('hex')
const request = async (path, options) => {
  const response = await fetch(`http://localhost:3001${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
  })
  return { status: response.status, body: await response.json() }
}

await wait(180)
const backupCode = 'SMOKE123'
const secret = fingerprint(backupCode)
const created = await request('/api/meals', {
  method: 'POST',
  body: JSON.stringify({
    stallId: 'iya-basiras-buka',
    firstName: 'Smoke test',
    secretFingerprint: secretFingerprint(secret),
    backupFingerprint: fingerprint(backupCode),
    practice: true,
  }),
})
if (created.status !== 201) throw new Error(`buy failed: ${JSON.stringify(created.body)}`)
const id = created.body.id

const wrong = await request('/api/counter/check', { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', mealId: id, backupCode: 'WRONG123' }) })
if (wrong.status !== 401 || wrong.body.error !== 'wrong_code') throw new Error(`wrong code passed: ${JSON.stringify(wrong)}`)

const checked = await request('/api/counter/check', { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', backupCode }) })
if (checked.status !== 200 || checked.body.id !== id) throw new Error(`check failed: ${JSON.stringify(checked)}`)

const wrongStall = await request('/api/counter/check', { method: 'POST', body: JSON.stringify({ stallId: 'different-stall', mealId: id, backupCode }) })
if (wrongStall.status !== 403 || wrongStall.body.error !== 'wrong_stall') throw new Error(`wrong stall passed: ${JSON.stringify(wrongStall)}`)

const earlyRefund = await request(`/api/meals/${id}/refund`, { method: 'POST', body: '{}' })
if (earlyRefund.status !== 409 || earlyRefund.body.error !== 'not_expired') throw new Error(`early refund passed: ${JSON.stringify(earlyRefund)}`)

const served = await request(`/api/meals/${id}/serve`, { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', backupCode }) })
if (served.status !== 200 || served.body.status !== 'Served') throw new Error(`serve failed: ${JSON.stringify(served)}`)

const second = await request(`/api/meals/${id}/serve`, { method: 'POST', body: JSON.stringify({ stallId: 'iya-basiras-buka', backupCode }) })
if (second.status !== 409 || second.body.error !== 'already_used') throw new Error(`second serve passed: ${JSON.stringify(second)}`)

const publicMeal = await request(`/api/meals/${id}`)
const publicText = JSON.stringify(publicMeal.body)
if (/fingerprint|secret|backup/i.test(publicText)) throw new Error(`public meal exposed a card secret: ${publicText}`)

const nonAdmin = await request('/api/admin/stalls', { method: 'POST', body: JSON.stringify({ name: 'No key', city: 'Lagos', address: 'Nowhere', priceCents: 300 }) })
if (nonAdmin.status !== 401 || nonAdmin.body.error !== 'not_allowed') throw new Error(`non-admin add passed: ${JSON.stringify(nonAdmin)}`)

const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
const admin = await request('/api/admin/stalls', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY }, body: JSON.stringify({ name: `Smoke Stall ${randomUUID().slice(0, 6)}`, city: 'Lagos', address: 'Smoke Street', priceCents: 300, payoutAddress: 'GSMOKE', photo: onePixelPng }) })
if (admin.status !== 201) throw new Error(`admin add failed: ${JSON.stringify(admin.body)}`)

const badPhoto = await request('/api/admin/stalls', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY }, body: JSON.stringify({ name: `Bad Photo ${randomUUID().slice(0, 6)}`, city: 'Lagos', address: 'Smoke Street', priceCents: 300, payoutAddress: 'GSMOKE', photo: 'data:text/plain;base64,ZmFrZQ==' }) })
if (badPhoto.status !== 413 || badPhoto.body.error !== 'photo_too_large_or_not_a_photo') throw new Error(`bad photo passed: ${JSON.stringify(badPhoto.body)}`)

const fakePhoto = await request('/api/admin/stalls', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY }, body: JSON.stringify({ name: `Fake Photo ${randomUUID().slice(0, 6)}`, city: 'Lagos', address: 'Smoke Street', priceCents: 300, payoutAddress: 'GSMOKE', photo: 'data:image/jpeg;base64,ZmFrZQ==' }) })
if (fakePhoto.status !== 413 || fakePhoto.body.error !== 'photo_too_large_or_not_a_photo') throw new Error(`fake photo passed: ${JSON.stringify(fakePhoto.body)}`)

console.log(JSON.stringify({ ok: true, checks: ['buy', 'wrong code refused', 'backup code accepted', 'wrong stall refused', 'early refund refused', 'serve once', 'second serve refused', 'public page has no card secret', 'non-admin add refused', 'admin stall photo accepted', 'non-photo refused', 'fake photo refused'], mealId: id }))
process.exit(0)
