import type { AdminStallInput, CardCheckInput, Meal, MealCreateInput, ServeInput, Stall } from './types'
import { sha256 } from './crypto'

const localMealsKey = 'pendiente.local.meals.v1'
const localStallsKey = 'pendiente.local.stalls.v1'

const starterStall: Stall = {
  id: 'iya-basiras-buka',
  name: 'Iya Basira’s Buka',
  city: 'Lagos, Nigeria',
  address: '12 Market Street, Lagos',
  priceCents: 300,
  active: true,
  photo: 'plate',
  waitingCount: 7,
}

type LocalMeal = Meal & { secretFingerprint: string; backupFingerprint: string }

function readLocalMeals(): LocalMeal[] {
  try {
    return JSON.parse(localStorage.getItem(localMealsKey) ?? '[]') as LocalMeal[]
  } catch {
    return []
  }
}

function writeLocalMeals(meals: LocalMeal[]) {
  localStorage.setItem(localMealsKey, JSON.stringify(meals))
}

function localStall(): Stall[] {
  try {
    const stalls = JSON.parse(localStorage.getItem(localStallsKey) ?? 'null') as Stall[] | null
    return stalls?.length ? stalls : [starterStall]
  } catch {
    return [starterStall]
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? `Request failed: ${response.status}`)
  return response.json() as Promise<T>
}

export async function getStalls(): Promise<Stall[]> {
  try {
    return await request<Stall[]>('/api/stalls')
  } catch {
    const meals = readLocalMeals()
    return localStall().map((stall) => ({
      ...stall,
      waitingCount: meals.filter((meal) => meal.stallId === stall.id && meal.status === 'Waiting').length,
    }))
  }
}

export async function getMeal(id: string): Promise<Meal | null> {
  try {
    return await request<Meal>(`/api/meals/${encodeURIComponent(id)}`)
  } catch {
    return readLocalMeals().find((meal) => meal.id === id) ?? null
  }
}

export async function createMeal(input: MealCreateInput): Promise<Meal> {
  try {
    return await request<Meal>('/api/meals', { method: 'POST', body: JSON.stringify(input) })
  } catch {
    const stall = localStall().find((item) => item.id === input.stallId) ?? starterStall
    const id = `practice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const now = new Date()
    const meal: LocalMeal = {
      id,
      stallId: input.stallId,
      firstName: input.firstName,
      message: input.message,
      email: input.email,
      amountCents: stall.priceCents,
      status: 'Waiting',
      boughtAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString(),
      paymentLink: `https://stellar.expert/explorer/testnet/tx/${id}`,
      secretFingerprint: input.secretFingerprint,
      backupFingerprint: input.backupFingerprint,
    }
    writeLocalMeals([...readLocalMeals(), meal])
    return meal
  }
}

export async function serveMeal(id: string, input: ServeInput): Promise<Meal> {
  try {
    return await request<Meal>(`/api/meals/${encodeURIComponent(id)}/serve`, { method: 'POST', body: JSON.stringify(input) })
  } catch {
    const meals = readLocalMeals()
    const meal = meals.find((item) => item.id === id)
    if (!meal) throw new Error('not_found')
    if (meal.stallId !== input.stallId) throw new Error('wrong_stall')
    if (meal.status !== 'Waiting') throw new Error('already_used')
    if (new Date(meal.expiresAt).getTime() < Date.now()) throw new Error('expired')
    const valid = input.secret && await sha256(input.secret) === meal.secretFingerprint
    const backupValid = input.backupCode && await sha256(input.backupCode) === meal.backupFingerprint
    if (!valid && !backupValid) throw new Error('wrong_code')
    const served: LocalMeal = { ...meal, status: 'Served', servedAt: new Date().toISOString(), photoData: input.photoData }
    writeLocalMeals(meals.map((item) => item.id === id ? served : item))
    return served
  }
}

export async function checkMealCard(input: CardCheckInput): Promise<Meal> {
  try {
    return await request<Meal>('/api/counter/check', { method: 'POST', body: JSON.stringify(input) })
  } catch {
    const meals = readLocalMeals()
    const byId = input.mealId ? meals.filter((meal) => meal.id === input.mealId) : meals
    const secretFingerprint = input.secret ? await sha256(input.secret) : undefined
    const backupFingerprint = input.backupCode ? await sha256(input.backupCode) : undefined
    const meal = byId.find((item) => item.stallId === input.stallId &&
      ((secretFingerprint && item.secretFingerprint === secretFingerprint) ||
       (backupFingerprint && item.backupFingerprint === backupFingerprint)))
    if (!meal) {
      const anyMeal = byId.find((item) => input.mealId ? item.id === input.mealId : item.stallId === input.stallId)
      if (anyMeal?.stallId !== input.stallId) throw new Error('wrong_stall')
      throw new Error('wrong_code')
    }
    if (meal.status !== 'Waiting') throw new Error('already_used')
    if (new Date(meal.expiresAt).getTime() < Date.now()) throw new Error('expired')
    return meal
  }
}

export async function getProof(): Promise<Meal[]> {
  try {
    return await request<Meal[]>('/api/proof')
  } catch {
    return readLocalMeals().sort((a, b) => b.boughtAt.localeCompare(a.boughtAt))
  }
}

export async function refundMeal(id: string): Promise<Meal> {
  return request<Meal>(`/api/meals/${encodeURIComponent(id)}/refund`, { method: 'POST' })
}

export async function createStall(input: AdminStallInput): Promise<Stall> {
  try {
    return await request<Stall>('/api/admin/stalls', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': input.adminKey }, body: JSON.stringify(input) })
  } catch (error) {
    if (error instanceof Error && (error.message.includes('not_allowed') || error.message.includes('invalid_stall'))) throw error
    const id = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || `stall-${Date.now()}`
    const stall: Stall = { id, name: input.name, city: input.city, address: input.address, priceCents: input.priceCents, active: true, photo: input.photo ?? 'plate', waitingCount: 0 }
    const stalls = localStall().filter((item) => item.id !== id)
    localStorage.setItem(localStallsKey, JSON.stringify([...stalls, stall]))
    return stall
  }
}

export { starterStall }
