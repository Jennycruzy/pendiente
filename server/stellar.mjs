import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const runFile = promisify(execFile)
const enabled = process.env.STELLAR_ENABLED === 'true'
const contractId = process.env.STELLAR_CONTRACT_ID || ''
const source = process.env.STELLAR_SOURCE_ACCOUNT || ''
const feeSource = process.env.STELLAR_FEE_SOURCE_ACCOUNT || source
const network = process.env.STELLAR_NETWORK || 'testnet'
const cli = process.env.STELLAR_CLI_PATH || 'stellar'

function ready() {
  if (!enabled) return false
  if (!contractId || !source) throw new Error('stellar_not_configured')
  return true
}

async function invoke(command, sourceAccount = feeSource) {
  const args = ['contract', 'invoke', '--id', contractId, '--source', sourceAccount, '--network', network, '--', ...command]
  const { stdout, stderr } = await runFile(cli, args, { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 })
  const paymentLinks = stderr.match(/https:\/\/stellar\.expert\/explorer\/[^\s]+\/tx\/[0-9a-f]+/g) ?? []
  return { value: stdout.trim(), paymentLink: paymentLinks.at(-1) }
}

export function stellarIsEnabled() {
  return ready()
}

export async function buyOnStellar({ stallId, fingerprint }) {
  if (!ready()) return null
  const result = await invoke(['buy', '--buyer', source, '--stall_id', String(stallId), '--fingerprint', fingerprint], source)
  const mealId = Number(result.value.split(/\s+/).at(-1))
  if (!Number.isSafeInteger(mealId)) throw new Error('stellar_buy_failed')
  return { mealId, paymentLink: result.paymentLink }
}

export async function mealOnStellar(mealId) {
  if (!ready()) return null
  const result = await invoke(['get_meal', '--meal_id', String(mealId)])
  return JSON.parse(result.value)
}

export async function serveOnStellar({ mealId, secret }) {
  if (!ready()) return null
  try {
    return await invoke(['serve', '--meal_id', String(mealId), '--secret', secret])
  } catch (error) {
    const meal = await mealOnStellar(mealId).catch(() => null)
    if (meal?.status === 'Served') return { paymentLink: undefined, reconciled: true }
    throw error
  }
}

export async function refundOnStellar(mealId) {
  if (!ready()) return null
  try {
    return await invoke(['refund', '--meal_id', String(mealId)])
  } catch (error) {
    const meal = await mealOnStellar(mealId).catch(() => null)
    if (meal?.status === 'Returned') return { paymentLink: undefined, reconciled: true }
    throw error
  }
}

export async function keepAliveOnStellar(mealId) {
  if (!ready()) return null
  return invoke(['keep_alive', '--meal_id', String(mealId)])
}
