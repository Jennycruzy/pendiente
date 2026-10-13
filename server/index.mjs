import express from 'express'
import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as realChain from './stellar.mjs'

const port = Number(process.env.PORT || 3011)
const dataDir = process.env.PENDIENTE_DATA_DIR || resolve(process.env.HOME || '.', 'pendiente-data')
const databasePath = process.env.PENDIENTE_DB || resolve(dataDir, 'pendiente.sqlite')
const photoDir = resolve(dataDir, 'photos')
mkdirSync(dirname(databasePath), { recursive: true })
mkdirSync(photoDir, { recursive: true })

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const fingerprintSecret = (value) => /^[0-9a-f]{64}$/i.test(String(value))
  ? createHash('sha256').update(Buffer.from(String(value), 'hex')).digest('hex') : ''
const backupPreimage = (code) => sha256(Buffer.from(`pendiente-backup-v1:${String(code).replaceAll('-', '').toUpperCase()}`))
const asIso = (value) => {
  if (typeof value === 'string') return value
  if (value == null) return new Date().toISOString()
  return new Date(Number(value) * 1000).toISOString()
}
const validFingerprint = (value) => /^[0-9a-f]{64}$/i.test(String(value))
const plainAddress = (value) => typeof value === 'string' && /^G[A-Z2-7]{55}$/.test(value)

function setupDb(db) {
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS stalls (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL, address TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 100), payout_address TEXT NOT NULL DEFAULT '',
      photo TEXT NOT NULL DEFAULT 'plate', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
      chain_stall_id INTEGER UNIQUE
    );
    CREATE TABLE IF NOT EXISTS meals (
      id TEXT PRIMARY KEY, stall_id TEXT NOT NULL REFERENCES stalls(id), first_name TEXT,
      message TEXT, email TEXT, amount_cents INTEGER NOT NULL, secret_fingerprint TEXT NOT NULL,
      backup_fingerprint TEXT NOT NULL, bought_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Waiting', 'Served', 'Returned')), served_at TEXT,
      photo_data TEXT, payment_link TEXT, chain_meal_id INTEGER, serve_tx TEXT, refund_tx TEXT,
      photo_path TEXT
    );
    CREATE TABLE IF NOT EXISTS fund_limits (address TEXT PRIMARY KEY, funded_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS prepared_buys (hash TEXT PRIMARY KEY, data TEXT NOT NULL);
  `)
  const alters = [
    ['stalls', 'chain_stall_id INTEGER'],
    ['meals', 'serve_tx TEXT'], ['meals', 'refund_tx TEXT'], ['meals', 'photo_path TEXT'],
  ]
  for (const [table, column] of alters) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column.split(' ')[0])) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`)
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS stalls_chain_id ON stalls(chain_stall_id)')
  if (!db.prepare('SELECT id FROM stalls WHERE id = ?').get('iya-basiras-buka')) {
    db.prepare(`INSERT INTO stalls (id,name,city,address,price_cents,payout_address,photo,active,created_at,chain_stall_id)
      VALUES (?,?,?,?,?,?,?,?,?,NULL)`).run('iya-basiras-buka', 'Iya Basira’s Buka', 'Lagos, Nigeria', '12 Market Street, Lagos', 300, '', 'plate', 1, new Date().toISOString())
  }
  return db
}

function createApp({ db: suppliedDb, chain = realChain } = {}) {
  const db = setupDb(suppliedDb || new Database(databasePath))
  const app = express()
  const pendingBuys = new Map()
  for (const row of db.prepare('SELECT * FROM prepared_buys').all()) pendingBuys.set(row.hash, JSON.parse(row.data))
  app.use(express.json({ limit: '650kb' }))
  app.use('/photos', express.static(photoDir, { maxAge: '1d', setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=86400') }))

  const publicMeal = (meal) => meal ? {
    id: meal.id, stallId: meal.stall_id, firstName: meal.first_name || undefined,
    message: meal.message || undefined, amountCents: meal.amount_cents, status: meal.status,
    boughtAt: meal.bought_at, expiresAt: meal.expires_at, servedAt: meal.served_at || undefined,
    photoUrl: meal.photo_path ? `/photos/${encodeURIComponent(basename(meal.photo_path))}` : undefined,
    paymentLink: meal.payment_link || undefined, serveLink: meal.serve_tx || undefined,
    refundLink: meal.refund_tx || undefined,
  } : null
  const waitingCount = (stallId) => db.prepare("SELECT COUNT(*) AS count FROM meals WHERE stall_id = ? AND status = 'Waiting'").get(stallId).count || 0
  const publicStall = (stall) => ({ id: stall.id, name: stall.name, city: stall.city, address: stall.address,
    priceCents: stall.price_cents, active: Boolean(stall.active), photo: stall.photo, waitingCount: waitingCount(stall.id) })
  const fail = (res, status, error) => res.status(status).json({ error })

  const photoIsSafe = (photoData) => {
    if (!photoData) return true
    if (photoData === 'plate') return true
    if (typeof photoData !== 'string' || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(photoData)) return false
    const bytes = Buffer.from(photoData.split(',')[1] || '', 'base64')
    if (!bytes.length || bytes.length > 300 * 1024) return false
    const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const webp = bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
    return jpeg || png || webp
  }

  const savePhoto = (mealId, photoData) => {
    if (!photoData || photoData === 'plate') return null
    const match = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(photoData)
    if (!match) return null
    const path = resolve(photoDir, `${mealId}.jpg`)
    writeFileSync(path, Buffer.from(match[2], 'base64'), { mode: 0o600 })
    return path
  }

  const findMealForCard = ({ stallId, mealId, secret, backupCode }) => {
    const candidate = mealId
      ? db.prepare('SELECT * FROM meals WHERE id = ?').get(mealId)
      : backupCode ? db.prepare('SELECT * FROM meals WHERE backup_fingerprint = ? ORDER BY bought_at DESC LIMIT 1').get(fingerprintSecret(backupPreimage(backupCode))) : null
    if (!candidate) return { error: 'not_found' }
    if (candidate.stall_id !== stallId) return { error: 'wrong_stall' }
    const secretMatches = secret ? candidate.secret_fingerprint === fingerprintSecret(secret) : false
    const backupMatches = backupCode ? candidate.backup_fingerprint === fingerprintSecret(backupPreimage(backupCode)) : false
    if (!secretMatches && !backupMatches) return { error: 'wrong_code' }
    if (candidate.status !== 'Waiting') return { error: 'already_used' }
    if (new Date(candidate.expires_at).getTime() <= Date.now()) return { error: 'expired' }
    return { meal: candidate }
  }

  app.get('/api/health', async (_req, res) => {
    try {
      const config = chain.stellarConfig?.() || { network: 'practice', contractId: '' }
      const ledger = chain.latestLedger ? await chain.latestLedger() : null
      res.json({ ok: true, network: config.network, contract: config.contractId, ledger })
    } catch (error) { fail(res, 503, error instanceof Error ? error.message : 'chain_unavailable') }
  })

  app.get('/api/stalls', (_req, res) => res.json(db.prepare('SELECT * FROM stalls WHERE active = 1 ORDER BY created_at ASC').all().map(publicStall)))
  app.get('/api/practice/balance/:address', async (req, res) => {
    if (!chain.validAddress(req.params.address)) return fail(res, 400, 'invalid_address')
    try { res.json({ balance: await chain.tokenBalance(req.params.address), refundSeconds: (await chain.getSettings()).refund_seconds }) }
    catch (error) { console.error(error.message); fail(res, 502, 'network_failure') }
  })
  app.post('/api/practice/trust/prepare', async (req, res) => {
    if (!chain.validAddress(req.body?.address)) return fail(res, 400, 'invalid_address')
    try { res.json(await chain.prepareTrust(req.body.address)) }
    catch (error) { console.error(error.message); fail(res, 502, 'network_failure') }
  })
  app.post('/api/practice/trust/submit', async (req, res) => {
    try { res.json(await chain.submitTrust(req.body?.signedXdr)) }
    catch (error) { console.error(error.message); fail(res, 502, 'network_failure') }
  })

  app.post('/api/meals/prepare', async (req, res) => {
    const { stallId, buyer, fingerprint, backupFingerprint } = req.body || {}
    if (!stallId || !plainAddress(buyer) || !validFingerprint(fingerprint) || !validFingerprint(backupFingerprint)) return fail(res, 400, 'invalid_payment')
    const stall = db.prepare('SELECT * FROM stalls WHERE id = ? AND active = 1 AND chain_stall_id IS NOT NULL').get(stallId)
    if (!stall) return fail(res, 400, 'stall_unavailable')
    try {
      const price = (await chain.getStall(stall.chain_stall_id)).price
      if (await chain.tokenBalance(buyer) < price) return fail(res, 409, 'low_balance')
      const prepared = await chain.prepareBuy({ buyer, stallId: stall.chain_stall_id, fingerprint, backupFingerprint })
      if (!prepared) return fail(res, 503, 'payment_not_ready')
      const metadata = { stall, buyer, fingerprint, backupFingerprint }
      db.prepare('INSERT OR REPLACE INTO prepared_buys(hash,data) VALUES (?,?)').run(prepared.hash, JSON.stringify(metadata))
      pendingBuys.set(prepared.hash, metadata)
      res.json({ ...prepared, amountCents: Math.round(price / 100_000), token: chain.stellarConfig?.().tokenId })
    } catch (error) { fail(res, 502, error instanceof Error ? error.message : 'payment_not_ready') }
  })

  app.post('/api/meals/submit', async (req, res) => {
    const { signedXdr, firstName = '', message = '', email = '' } = req.body || {}
    if (!signedXdr) return fail(res, 400, 'missing_payment')
    try {
      const preparedHash = chain.paymentHash(signedXdr)
      if (!pendingBuys.has(preparedHash)) return fail(res, 400, 'payment_not_found')
      const sent = await chain.submitBuy({ signedXdr })
      const pending = pendingBuys.get(sent.hash)
      const chainMeal = sent.mealId ? await chain.getMeal(sent.mealId) : null
      if (!pending || !chainMeal) return fail(res, 502, 'payment_not_found')
      if (String(chainMeal.buyer) !== pending.buyer || Number(chainMeal.stall_id) !== Number(pending.stall.chain_stall_id)) return fail(res, 502, 'payment_mismatch')
      if (String(chainMeal.fingerprint).toLowerCase() !== pending.fingerprint.toLowerCase() || String(chainMeal.backup_fingerprint).toLowerCase() !== pending.backupFingerprint.toLowerCase()) return fail(res, 502, 'payment_mismatch')
      const id = `meal-${sent.mealId}`
      db.prepare(`INSERT OR IGNORE INTO meals (id,stall_id,first_name,message,email,amount_cents,secret_fingerprint,backup_fingerprint,bought_at,expires_at,status,payment_link,chain_meal_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?, ?, ?)`).run(id, pending.stall.id, String(firstName).slice(0, 40), String(message).slice(0, 80), String(email).slice(0, 160), Math.round(Number(chainMeal.amount) / 100_000), pending.fingerprint, pending.backupFingerprint, asIso(chainMeal.bought_at), asIso(chainMeal.expires_at), chainMeal.status || 'Waiting', sent.link, sent.mealId)
      res.status(201).json(publicMeal(db.prepare('SELECT * FROM meals WHERE id = ?').get(id)))
    } catch (error) { fail(res, 502, error instanceof Error ? error.message : 'payment_not_sent') }
  })

  app.get('/api/meals/:id', async (req, res) => {
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

  app.post('/api/meals/:id/serve', async (req, res) => {
    const { stallId, secret, backupCode, photoData } = req.body || {}
    if (!stallId || (!secret && !backupCode)) return fail(res, 400, 'missing_fields')
    if (!photoIsSafe(photoData)) return fail(res, 413, 'photo_too_large_or_not_a_photo')
    const result = findMealForCard({ stallId, mealId: req.params.id, secret, backupCode })
    if (result.error) return fail(res, result.error === 'wrong_stall' ? 403 : result.error === 'wrong_code' ? 401 : 409, result.error)
    const preimage = secret || backupPreimage(backupCode)
    let payment
    try { payment = result.meal.chain_meal_id ? await chain.serve({ mealId: result.meal.chain_meal_id, preimage }) : null } catch (error) { return fail(res, 502, error instanceof Error ? error.message : 'payment_not_sent') }
    const path = savePhoto(result.meal.id, photoData)
    const servedAt = new Date().toISOString()
    const changed = db.prepare("UPDATE meals SET status='Served',served_at=?,photo_path=?,serve_tx=? WHERE id=? AND status='Waiting'").run(servedAt, path, payment?.link || null, result.meal.id)
    if (changed.changes !== 1) return fail(res, 409, 'already_used')
    if (result.meal.email && process.env.POSTMARK_SERVER_TOKEN && process.env.POSTMARK_FROM_EMAIL) {
      const mealUrl = `${process.env.PUBLIC_SITE_URL || 'https://pendiente.54-154-121-30.sslip.io'}/meal/${result.meal.id}`
      void fetch('https://api.postmarkapp.com/email', {
        method: 'POST', headers: { 'content-type': 'application/json', 'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN },
        body: JSON.stringify({ From: process.env.POSTMARK_FROM_EMAIL, To: result.meal.email, Subject: 'Your meal was served', TextBody: `Your meal was served. See the plate: ${mealUrl}`, MessageStream: 'outbound' }),
      }).then((response) => { if (!response.ok) throw new Error(`Email failed: ${response.status}`) }).catch((error) => console.error(error.message))
    }
    res.json(publicMeal(db.prepare('SELECT * FROM meals WHERE id = ?').get(result.meal.id)))
  })

  app.post('/api/meals/:id/refund', async (req, res) => {
    const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id)
    if (!meal) return fail(res, 404, 'not_found')
    if (meal.status !== 'Waiting') return fail(res, 409, 'already_used')
    const onChain = meal.chain_meal_id ? await chain.getMeal(meal.chain_meal_id).catch(() => null) : null
    if (!onChain) return fail(res, 502, 'chain_unavailable')
    if (Number(onChain.expires_at) > await chain.ledgerTime()) return fail(res, 409, 'not_expired')
    try {
      const payment = meal.chain_meal_id ? await chain.refund(meal.chain_meal_id) : null
      db.prepare("UPDATE meals SET status='Returned',refund_tx=? WHERE id=? AND status='Waiting'").run(payment?.link || null, meal.id)
      res.json(publicMeal(db.prepare('SELECT * FROM meals WHERE id = ?').get(meal.id)))
    } catch (error) { fail(res, 502, error instanceof Error ? error.message : 'return_not_sent') }
  })

  app.get('/api/proof', (req, res) => {
    const limit = 20
    const offset = Math.max(0, Number(req.query.cursor || 0) || 0)
    const items = db.prepare("SELECT m.*,s.name AS stall_name FROM meals m JOIN stalls s ON s.id=m.stall_id WHERE m.status != 'Waiting' ORDER BY m.bought_at DESC LIMIT ? OFFSET ?").all(limit, offset)
      .map((meal) => ({ id: meal.id, stallId: meal.stall_id, stall: meal.stall_name, amountCents: meal.amount_cents, status: meal.status, boughtAt: meal.bought_at, servedAt: meal.served_at, firstNameInitial: meal.first_name ? `${meal.first_name[0]}.` : undefined, photoUrl: meal.photo_path ? `/photos/${encodeURIComponent(basename(meal.photo_path))}` : undefined, paymentLink: meal.payment_link, serveLink: meal.serve_tx, refundLink: meal.refund_tx }))
    const totals = db.prepare(`SELECT COUNT(*) AS bought, COALESCE(SUM(CASE WHEN status='Served' THEN 1 ELSE 0 END),0) AS served,
      COALESCE(SUM(CASE WHEN status='Returned' THEN 1 ELSE 0 END),0) AS returned, COALESCE(SUM(CASE WHEN status='Served' THEN amount_cents ELSE 0 END),0) AS paid,
      COALESCE(SUM(CASE WHEN status='Returned' THEN amount_cents ELSE 0 END),0) AS returnedCents FROM meals`).get()
    res.json({ totals: { bought: totals.bought, served: totals.served, returned: totals.returned, paidCents: totals.paid, returnedCents: totals.returnedCents, waiting: db.prepare("SELECT COUNT(*) AS count FROM meals WHERE status='Waiting'").get().count }, items, nextCursor: items.length === limit ? String(offset + limit) : null })
  })

  app.post('/api/practice/fund', async (req, res) => {
    const recipient = String(req.body?.address || '')
    if (!chain.validAddress?.(recipient) && !plainAddress(recipient)) return fail(res, 400, 'invalid_address')
    const previous = db.prepare('SELECT funded_at FROM fund_limits WHERE address = ?').get(recipient)
    if (previous && Date.now() - Date.parse(previous.funded_at) < 3_600_000) return fail(res, 429, 'funded_recently')
    try {
      const payment = await (chain.fundPlayUsdc || chain.mintPlayUsdc)({ address: recipient })
      db.prepare('INSERT OR REPLACE INTO fund_limits(address,funded_at) VALUES (?,?)').run(recipient, new Date().toISOString())
      res.json({ hash: payment.hash, link: payment.link, balance: await chain.tokenBalance(recipient) })
    } catch (error) { fail(res, 502, error instanceof Error ? error.message : 'funding_failed') }
  })

  app.post('/api/admin/stalls', async (req, res) => {
    if (!process.env.ADMIN_KEY || req.get('x-admin-key') !== process.env.ADMIN_KEY) return fail(res, 401, 'not_allowed')
    const { name, city, address, priceCents, payoutAddress, photo = 'plate' } = req.body || {}
    if (!name || !city || !address || !chain.validAddress(payoutAddress) || !Number.isSafeInteger(Number(priceCents)) || Number(priceCents) < 100 || !photoIsSafe(photo)) return fail(res, 400, 'invalid_stall')
    if (!await chain.hasTrustline(payoutAddress)) return fail(res, 400, 'missing_trustline')
    const chainStallId = Number(db.prepare('SELECT COALESCE(MAX(chain_stall_id),0)+1 AS next FROM stalls').get().next)
    try { await chain.addStall({ stallId: chainStallId, payout: payoutAddress, price: Math.round(Number(priceCents) * 100_000), active: true }) } catch (error) { return fail(res, 502, error instanceof Error ? error.message : 'stall_not_added') }
    const id = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || `stall-${Date.now()}`
    db.prepare(`INSERT INTO stalls(id,name,city,address,price_cents,payout_address,photo,active,created_at,chain_stall_id) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, name, city, address, Number(priceCents), payoutAddress, photo, 1, new Date().toISOString(), chainStallId)
    res.status(201).json(publicStall(db.prepare('SELECT * FROM stalls WHERE id=?').get(id)))
  })

  app.patch('/api/admin/stalls/:id', async (req, res) => {
    if (!process.env.ADMIN_KEY || req.get('x-admin-key') !== process.env.ADMIN_KEY) return fail(res, 401, 'not_allowed')
    const stall = db.prepare('SELECT * FROM stalls WHERE id=?').get(req.params.id)
    if (!stall) return fail(res, 404, 'not_found')
    const priceCents = Number(req.body.priceCents ?? stall.price_cents)
    const payoutAddress = req.body.payoutAddress ?? stall.payout_address
    const active = req.body.active == null ? Boolean(stall.active) : Boolean(req.body.active)
    if (!chain.validAddress(payoutAddress) || !Number.isSafeInteger(priceCents) || priceCents < 100) return fail(res, 400, 'invalid_stall')
    if (!await chain.hasTrustline(payoutAddress)) return fail(res, 400, 'missing_trustline')
    try { await chain.updateStall({ stallId: stall.chain_stall_id, payout: payoutAddress, price: Math.round(priceCents * 100_000), active }) } catch (error) { return fail(res, 502, error instanceof Error ? error.message : 'stall_not_updated') }
    db.prepare('UPDATE stalls SET price_cents=?,payout_address=?,active=? WHERE id=?').run(priceCents, payoutAddress, active ? 1 : 0, stall.id)
    res.json(publicStall(db.prepare('SELECT * FROM stalls WHERE id=?').get(stall.id)))
  })

  async function reconcile() {
    for (const meal of db.prepare("SELECT * FROM meals WHERE status='Waiting' AND chain_meal_id IS NOT NULL").all()) {
      try {
        const current = await chain.getMeal(meal.chain_meal_id)
        if (current?.status && current.status !== meal.status) {
          db.prepare('UPDATE meals SET status=? WHERE id=?').run(current.status, meal.id)
          console.log(`reconciled ${meal.id} to ${current.status}`)
        }
      } catch (error) { console.error(`reconcile failed for ${meal.id}: ${error instanceof Error ? error.message : error}`) }
    }
  }

  async function returnExpiredMeals() {
    for (const meal of db.prepare("SELECT * FROM meals WHERE status='Waiting' AND chain_meal_id IS NOT NULL").all()) {
      try {
        const current = await chain.getMeal(meal.chain_meal_id)
        if (!current) throw new Error('Meal unavailable on Stellar')
        if (current.status !== 'Waiting') {
          db.prepare('UPDATE meals SET status=? WHERE id=?').run(current.status, meal.id)
          continue
        }
        if (Number(current.expires_at) > await chain.ledgerTime()) continue
        const payment = await chain.refund(meal.chain_meal_id)
        db.prepare("UPDATE meals SET status='Returned',refund_tx=? WHERE id=? AND status='Waiting'").run(payment?.link || null, meal.id)
      } catch (error) { console.error(`return failed for ${meal.id}: ${error instanceof Error ? error.message : error}`) }
    }
  }

  app.locals.reconcile = reconcile
  app.locals.returnExpiredMeals = returnExpiredMeals
  app.locals.keepAlive = async () => {
    for (const meal of db.prepare('SELECT chain_meal_id FROM meals WHERE chain_meal_id IS NOT NULL').all()) {
      try { await chain.keepAlive(meal.chain_meal_id) }
      catch (error) { console.error(`Storage renewal failed: ${error.message}`) }
    }
    for (const stall of db.prepare('SELECT * FROM stalls WHERE chain_stall_id IS NOT NULL').all()) {
      try {
        const current = await chain.getStall(stall.chain_stall_id)
        await chain.updateStall({ stallId: stall.chain_stall_id, payout: current.payout, price: current.price, active: current.active })
      }
      catch (error) { console.error(`Stall renewal failed: ${error.message}`) }
    }
  }
  app.locals.db = db
  return app
}

async function startServer() {
  const app = createApp()
  app.listen(port, () => console.log(`Pendiente server listening on http://localhost:${port}`))
  await app.locals.reconcile()
  setInterval(() => { void app.locals.returnExpiredMeals() }, 60_000).unref()
  setInterval(() => { void app.locals.keepAlive() }, 86_400_000).unref()
  return app
}

export { createApp, startServer }

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await startServer()

