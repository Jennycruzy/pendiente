import type { AdminStallInput, CardCheckInput, Meal, MealCreateInput, PaymentPrepareInput, ServeInput, Stall } from './types'
import { fingerprintSecret, secretFromBackupCode } from './crypto'
import { practiceMode } from './wallet'

const localMealsKey = 'pendiente.local.meals.v2'
const localStallsKey = 'pendiente.local.stalls.v2'
const starterStall: Stall = { id: 'iya-basiras-buka', name: 'Iya Basira’s Buka', city: 'Lagos, Nigeria', address: '12 Market Street, Lagos', priceCents: 300, active: true, photo: 'plate', waitingCount: 0 }
type LocalMeal = Meal & { secretFingerprint: string; backupFingerprint: string }

const readLocalMeals = (): LocalMeal[] => { try { return JSON.parse(localStorage.getItem(localMealsKey) || '[]') as LocalMeal[] } catch { return [] } }
const writeLocalMeals = (meals: LocalMeal[]) => localStorage.setItem(localMealsKey, JSON.stringify(meals))
const localStall = (): Stall[] => { try { const value = JSON.parse(localStorage.getItem(localStallsKey) || 'null') as Stall[] | null; return value?.length ? value : [starterStall] } catch { return [starterStall] } }

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (practiceMode) throw new TypeError('local_practice')
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...options?.headers }, ...options })
  if (!response.ok) { const body = await response.json().catch(() => null); const error = new Error(body?.error || `Request failed: ${response.status}`); error.name = 'ApiError'; throw error }
  return response.json() as Promise<T>
}

export async function getStalls(): Promise<Stall[]> {
  try { return await request<Stall[]>('/api/stalls') } catch (error) {
    if (!practiceMode || error instanceof Error && error.name === 'ApiError') throw error
    const meals = readLocalMeals(); return localStall().map((stall) => ({ ...stall, waitingCount: meals.filter((meal) => meal.stallId === stall.id && meal.status === 'Waiting').length }))
  }
}

export async function getMeal(id: string): Promise<Meal | null> {
  try { return await request<Meal>(`/api/meals/${encodeURIComponent(id)}`) } catch (error) {
    if (error instanceof Error && error.name === 'ApiError' && error.message !== 'not_found') throw error
    return readLocalMeals().find((meal) => meal.id === id) ?? null
  }
}

export async function prepareMeal(input: PaymentPrepareInput) { return request<{ xdr: string; hash: string; amountCents: number }>('/api/meals/prepare', { method: 'POST', body: JSON.stringify(input) }) }
export async function submitMeal(signedXdr: string, details: Pick<MealCreateInput, 'firstName' | 'message' | 'email'>) { return request<Meal>('/api/meals/submit', { method: 'POST', body: JSON.stringify({ signedXdr, ...details }) }) }

export async function createMeal(input: MealCreateInput): Promise<Meal> {
  try {
    if (!input.practice) return await request<Meal>('/api/meals', { method: 'POST', body: JSON.stringify(input) })
  } catch (error) {
    if (error instanceof Error && error.name === 'ApiError') throw error
  }
  {
    const stall = localStall().find((item) => item.id === input.stallId) ?? starterStall
    const now = new Date(); const id = `practice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const meal: LocalMeal = { id, stallId: input.stallId, firstName: input.firstName, message: input.message, email: input.email, amountCents: stall.priceCents, status: 'Waiting', boughtAt: now.toISOString(), expiresAt: new Date(now.getTime() + 2 * 60 * 1000).toISOString(), secretFingerprint: input.secretFingerprint, backupFingerprint: input.backupFingerprint }
    writeLocalMeals([...readLocalMeals(), meal]); return meal
  }
}

export async function serveMeal(id: string, input: ServeInput): Promise<Meal> {
  try { return await request<Meal>(`/api/meals/${encodeURIComponent(id)}/serve`, { method: 'POST', body: JSON.stringify(input) }) } catch (error) {
    if (error instanceof Error && error.name === 'ApiError') throw error
    const meals = readLocalMeals(); const meal = meals.find((item) => item.id === id)
    if (!meal) throw new Error('not_found')
    if (meal.stallId !== input.stallId) throw new Error('wrong_stall')
    if (meal.status !== 'Waiting') throw new Error('already_used')
    if (new Date(meal.expiresAt).getTime() <= Date.now()) throw new Error('expired')
    const valid = Boolean(input.secret) && await fingerprintSecret(input.secret || '') === meal.secretFingerprint
    const backupValid = Boolean(input.backupCode) && await fingerprintSecret(await secretFromBackupCode(input.backupCode || '')) === meal.backupFingerprint
    if (!valid && !backupValid) throw new Error('wrong_code')
    const served: LocalMeal = { ...meal, status: 'Served', servedAt: new Date().toISOString(), photoData: input.photoData }
    writeLocalMeals(meals.map((item) => item.id === id ? served : item)); return served
  }
}

export async function checkMealCard(input: CardCheckInput): Promise<Meal> {
  try { return await request<Meal>('/api/counter/check', { method: 'POST', body: JSON.stringify(input) }) } catch (error) {
    if (error instanceof Error && error.name === 'ApiError') throw error
    const meals = readLocalMeals(); const secretFingerprint = input.secret ? await fingerprintSecret(input.secret) : ''
    const backupFingerprint = input.backupCode ? await fingerprintSecret(await secretFromBackupCode(input.backupCode)) : ''
    const meal = meals.find((item) => (!input.mealId || item.id === input.mealId) && item.stallId === input.stallId && (item.secretFingerprint === secretFingerprint || item.backupFingerprint === backupFingerprint))
    if (!meal) throw new Error('wrong_code')
    if (meal.status !== 'Waiting') throw new Error('already_used')
    if (new Date(meal.expiresAt).getTime() <= Date.now()) throw new Error('expired')
    return meal
  }
}

export type ProofData = { items: Meal[]; totals: { bought: number; served: number; returned: number; waiting: number; paidCents: number; returnedCents: number }; nextCursor: string | null }
export async function getProof(cursor = ''): Promise<ProofData> {
  try { return await request<ProofData>(`/api/proof?cursor=${encodeURIComponent(cursor)}`) } catch (error) {
    if (error instanceof Error && error.name === 'ApiError') throw error
    if (!practiceMode) throw error
    const meals = readLocalMeals()
    const served = meals.filter((meal) => meal.status === 'Served')
    const returned = meals.filter((meal) => meal.status === 'Returned')
    return { items: meals.filter((meal) => meal.status !== 'Waiting'), totals: { bought: meals.length, served: served.length, returned: returned.length, waiting: meals.length - served.length - returned.length, paidCents: served.reduce((sum, meal) => sum + meal.amountCents, 0), returnedCents: returned.reduce((sum, meal) => sum + meal.amountCents, 0) }, nextCursor: null }
  }
}
export async function refundMeal(id: string): Promise<Meal> { return request<Meal>(`/api/meals/${encodeURIComponent(id)}/refund`, { method: 'POST' }) }
export async function fundPractice(address: string) { return request('/api/practice/fund', { method: 'POST', body: JSON.stringify({ address }) }) }
export async function buyerBalance(address: string) { return request<{ balance: number; refundSeconds: number }>(`/api/practice/balance/${encodeURIComponent(address)}`) }
export async function prepareTrust(address: string) { return request<{ xdr: string }>('/api/practice/trust/prepare', { method: 'POST', body: JSON.stringify({ address }) }) }
export async function submitTrust(signedXdr: string) { return request('/api/practice/trust/submit', { method: 'POST', body: JSON.stringify({ signedXdr }) }) }

export async function createStall(input: AdminStallInput): Promise<Stall> {
  try { return await request<Stall>('/api/admin/stalls', { method: 'POST', headers: { 'x-admin-key': input.adminKey }, body: JSON.stringify(input) }) } catch (error) {
    if (error instanceof Error && error.name === 'ApiError') throw error
    const id = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || `stall-${Date.now()}`
    const stall: Stall = { id, name: input.name, city: input.city, address: input.address, priceCents: input.priceCents, active: true, photo: input.photo ?? 'plate', waitingCount: 0 }
    localStorage.setItem(localStallsKey, JSON.stringify([...localStall().filter((item) => item.id !== id), stall])); return stall
  }
}

export { starterStall }
