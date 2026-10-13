import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import * as chain from '../server/stellar.mjs'

const payout = process.env.STALL_PAYOUT_ADDRESS
if (!payout || !chain.validAddress(payout)) throw new Error('Set STALL_PAYOUT_ADDRESS to the owner-approved testnet payout account')
if (!await chain.hasTrustline(payout)) throw new Error('The payout account needs the play-USDC trustline first')
const db = new Database(process.env.PENDIENTE_DB || resolve(process.env.HOME, 'pendiente-data/pendiente.sqlite'))
try {
  const stall = db.prepare('SELECT * FROM stalls WHERE id=?').get('iya-basiras-buka')
  if (!stall) throw new Error('Start the server once to create the stall profile')
  if (stall.chain_stall_id != null) throw new Error('Stall is already registered')
  const stallId = db.prepare('SELECT COALESCE(MAX(chain_stall_id),0)+1 AS next FROM stalls').get().next
  const result = await chain.addStall({ stallId, payout, price: stall.price_cents * 100_000 })
  db.prepare('UPDATE stalls SET chain_stall_id=?,payout_address=? WHERE id=?').run(stallId, payout, stall.id)
  console.log(JSON.stringify({ stall: stall.id, chainStallId: stallId, payout, link: result.link }))
} finally { db.close() }
