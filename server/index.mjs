import express from 'express'
import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const port = Number(process.env.PORT || 3001)
const databasePath = process.env.PENDIENTE_DB || resolve(process.cwd(), 'server/pendiente.sqlite')
mkdirSync(dirname(databasePath), { recursive: true })
const db = new Database(databasePath)
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS stalls (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 100),
    payout_address TEXT NOT NULL DEFAULT '',
    photo TEXT NOT NULL DEFAULT 'plate',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    stall_id TEXT NOT NULL REFERENCES stalls(id),
    first_name TEXT,
    message TEXT,
    email TEXT,
    amount_cents INTEGER NOT NULL,
    secret_fingerprint TEXT NOT NULL,
    backup_fingerprint TEXT NOT NULL,
    bought_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Waiting', 'Served', 'Returned')),
    served_at TEXT,
    photo_data TEXT,
    payment_link TEXT
  );
`)
try { db.exec("ALTER TABLE stalls ADD COLUMN payout_address TEXT NOT NULL DEFAULT ''") } catch { /* already present */ }

const seed = db.prepare('SELECT id FROM stalls WHERE id = ?').get('iya-basiras-buka')
if (!seed) {
  db.prepare('INSERT INTO stalls (id, name, city, address, price_cents, payout_address, photo, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'iya-basiras-buka', 'Iya Basira’s Buka', 'Lagos, Nigeria', '12 Market Street, Lagos', 300, '', 'plate', 1, new Date().toISOString(),
  )
}

const app = express()
app.use(express.json({ limit: '650kb' }))

const hash = (value) => createHash('sha256').update(String(value)).digest('hex')
const publicMeal = (meal) => meal ? {
  id: meal.id,
  stallId: meal.stall_id,
  firstName: meal.first_name || undefined,
  message: meal.message || undefined,
  amountCents: meal.amount_cents,
  status: meal.status,
  boughtAt: meal.bought_at,
  expiresAt: meal.expires_at,
  servedAt: meal.served_at || undefined,
  photoData: meal.photo_data || undefined,
  paymentLink: meal.payment_link || undefined,
} : null
const publicStall = (stall) => ({
  id: stall.id,
  name: stall.name,
  city: stall.city,
  address: stall.address,
  priceCents: stall.price_cents,
  active: Boolean(stall.active),
  photo: stall.photo,
  waitingCount: db.prepare("SELECT COUNT(*) AS count FROM meals WHERE stall_id = ? AND status = 'Waiting'").get(stall.id).count || 0,
})

function fail(res, status, error) { return res.status(status).json({ error }) }

function photoIsSafe(photoData) {
  if (!photoData) return true
  if (typeof photoData !== 'string' || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(photoData)) return false
  const encoded = photoData.split(',')[1] || ''
  return Buffer.from(encoded, 'base64').byteLength <= 300 * 1024
}

function findMealForCard({ stallId, mealId, secret, backupCode }) {
  const candidate = mealId
    ? db.prepare('SELECT * FROM meals WHERE id = ?').get(mealId)
    : backupCode
      ? db.prepare('SELECT * FROM meals WHERE backup_fingerprint = ? ORDER BY bought_at DESC LIMIT 1').get(hash(backupCode))
      : null
  if (!candidate) return { error: 'not_found' }
  if (candidate.stall_id !== stallId) return { error: 'wrong_stall' }
  const secretMatches = secret ? candidate.secret_fingerprint === hash(secret) : false
  const backupMatches = backupCode ? candidate.backup_fingerprint === hash(backupCode) : false
  if (!secretMatches && !backupMatches) return { error: 'wrong_code' }
  if (candidate.status !== 'Waiting') return { error: 'already_used' }
  if (new Date(candidate.expires_at).getTime() <= Date.now()) return { error: 'expired' }
  return { meal: candidate }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, mode: 'practice' }))

app.get('/api/stalls', (_req, res) => {
  const stalls = db.prepare('SELECT * FROM stalls WHERE active = 1 ORDER BY created_at ASC').all().map(publicStall)
  res.json(stalls)
})

app.post('/api/meals', (req, res) => {
  const { stallId, firstName = '', message = '', email = '', secretFingerprint, backupFingerprint } = req.body || {}
  if (!stallId || !secretFingerprint || !backupFingerprint) return fail(res, 400, 'missing_fields')
  if (String(message).length > 80) return fail(res, 400, 'message_too_long')
  const stall = db.prepare('SELECT * FROM stalls WHERE id = ? AND active = 1').get(stallId)
  if (!stall) return fail(res, 400, 'stall_unavailable')
  const now = new Date()
  const practiceMinutes = Number(process.env.PRACTICE_EXPIRY_MINUTES || 30240)
  const expires = new Date(now.getTime() + practiceMinutes * 60 * 1000)
  const id = `meal-${randomUUID().slice(0, 8)}`
  db.prepare(`INSERT INTO meals (id, stall_id, first_name, message, email, amount_cents, secret_fingerprint, backup_fingerprint, bought_at, expires_at, status, payment_link)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Waiting', ?)`)
    .run(id, stallId, String(firstName).slice(0, 40), String(message), String(email).slice(0, 160), stall.price_cents, secretFingerprint, backupFingerprint, now.toISOString(), expires.toISOString(), `https://stellar.expert/explorer/testnet/tx/practice-${id}`)
  res.status(201).json(publicMeal(db.prepare('SELECT * FROM meals WHERE id = ?').get(id)))
})

app.get('/api/meals/:id', (req, res) => {
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id)
  if (!meal) return fail(res, 404, 'not_found')
  res.json(publicMeal(meal))
})

app.post('/api/counter/check', (req, res) => {
  const { stallId, mealId, secret, backupCode } = req.body || {}
  if (!stallId || (!mealId && !secret && !backupCode)) return fail(res, 400, 'missing_fields')
  const result = findMealForCard({ stallId, mealId, secret, backupCode })
  if (result.error) return fail(res, result.error === 'wrong_stall' ? 403 : result.error === 'wrong_code' ? 401 : 409, result.error)
  res.json(publicMeal(result.meal))
})

app.post('/api/meals/:id/serve', (req, res) => {
  const { stallId, secret, backupCode, photoData } = req.body || {}
  if (!stallId || (!secret && !backupCode)) return fail(res, 400, 'missing_fields')
  if (!photoIsSafe(photoData)) return fail(res, 413, 'photo_too_large_or_not_a_photo')
  const result = findMealForCard({ stallId, mealId: req.params.id, secret, backupCode })
  if (result.error) return fail(res, result.error === 'wrong_stall' ? 403 : result.error === 'wrong_code' ? 401 : 409, result.error)
  const servedAt = new Date().toISOString()
  const changed = db.prepare("UPDATE meals SET status = 'Served', served_at = ?, photo_data = ? WHERE id = ? AND status = 'Waiting'").run(servedAt, photoData || null, req.params.id)
  if (changed.changes !== 1) return fail(res, 409, 'already_used')
  res.json(publicMeal(db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id)))
})

app.post('/api/meals/:id/refund', (req, res) => {
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id)
  if (!meal) return fail(res, 404, 'not_found')
  if (meal.status !== 'Waiting') return fail(res, 409, 'already_used')
  if (new Date(meal.expires_at).getTime() > Date.now()) return fail(res, 409, 'not_expired')
  db.prepare("UPDATE meals SET status = 'Returned' WHERE id = ? AND status = 'Waiting'").run(req.params.id)
  res.json(publicMeal(db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id)))
})

app.get('/api/proof', (_req, res) => {
  const meals = db.prepare('SELECT * FROM meals ORDER BY bought_at DESC').all().map(publicMeal)
  res.json(meals)
})

app.post('/api/admin/stalls', (req, res) => {
  if (!process.env.ADMIN_KEY || req.get('x-admin-key') !== process.env.ADMIN_KEY) return fail(res, 401, 'not_allowed')
  const { name, city, address, priceCents, payoutAddress = '', photo = 'plate' } = req.body || {}
  if (!name || !city || !address || Number(priceCents) < 100) return fail(res, 400, 'invalid_stall')
  const id = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || `stall-${Date.now()}`
  db.prepare('INSERT INTO stalls (id, name, city, address, price_cents, payout_address, photo, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)').run(id, name, city, address, Number(priceCents), String(payoutAddress), photo, new Date().toISOString())
  res.status(201).json(publicStall(db.prepare('SELECT * FROM stalls WHERE id = ?').get(id)))
})

function returnExpiredMeals() {
  db.prepare("UPDATE meals SET status = 'Returned' WHERE status = 'Waiting' AND expires_at <= ?").run(new Date().toISOString())
}
setInterval(returnExpiredMeals, 60_000).unref()

app.listen(port, () => console.log(`Pendiente practice server listening on http://localhost:${port}`))
