async function digest(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('secure_crypto_unavailable')
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256(value: string): Promise<string> { return digest(new TextEncoder().encode(value)) }

export async function fingerprintSecret(secret: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/i.test(secret)) throw new Error('invalid_card_secret')
  return digest(Uint8Array.from(secret.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16)))
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomHex(bytes = 32): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('secure_crypto_unavailable')
  const values = new Uint8Array(bytes)
  globalThis.crypto.getRandomValues(values)
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('')
}

export function randomBackupCode(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('secure_crypto_unavailable')
  const values = new Uint8Array(16)
  globalThis.crypto.getRandomValues(values)
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('')
}

export function normalizeBackupCode(value: string): string { return String(value).replaceAll('-', '').replace(/\s/g, '').toUpperCase() }
export function formatBackupCode(value: string): string { return normalizeBackupCode(value).match(/.{1,4}/g)?.join('-') ?? '' }
export async function secretFromBackupCode(backupCode: string): Promise<string> { return sha256(`pendiente-backup-v1:${normalizeBackupCode(backupCode)}`) }

export async function newCardCredentials(): Promise<{ secret: string; backupCode: string; secretFingerprint: string; backupFingerprint: string }> {
  const secret = randomHex(32)
  const backupCode = randomBackupCode()
  const backupPreimage = await secretFromBackupCode(backupCode)
  return { secret, backupCode, secretFingerprint: await fingerprintSecret(secret), backupFingerprint: await fingerprintSecret(backupPreimage) }
}
