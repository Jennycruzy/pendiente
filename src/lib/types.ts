export type Language = 'en' | 'es'

export type MealStatus = 'Waiting' | 'Served' | 'Returned'

export interface Stall {
  id: string
  name: string
  city: string
  address: string
  priceCents: number
  active: boolean
  photo: string
  waitingCount: number
}

export interface Meal {
  id: string
  stallId: string
  firstName?: string
  message?: string
  email?: string
  amountCents: number
  status: MealStatus
  boughtAt: string
  expiresAt: string
  servedAt?: string
  photoData?: string
  paymentLink?: string
}

export interface CardSecret {
  mealId: string
  stallId: string
  secret: string
  backupCode: string
}

export interface MealCreateInput {
  stallId: string
  firstName?: string
  message?: string
  email?: string
  secretFingerprint: string
  backupFingerprint: string
  practice?: boolean
}

export interface ServeInput {
  stallId: string
  secret?: string
  backupCode?: string
  photoData?: string
}

export interface CardCheckInput {
  stallId: string
  mealId?: string
  secret?: string
  backupCode?: string
}

export interface AdminStallInput {
  name: string
  city: string
  address: string
  priceCents: number
  payoutAddress: string
  photo?: string
}
