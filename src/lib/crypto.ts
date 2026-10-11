async function digest(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('secure_crypto_unavailable')
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256(value: string): Promise<string> {
  return digest(new TextEncoder().encode(value))
}

export async function fingerprintSecret(secret: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/i.test(secret)) throw new Error('invalid_card_secret')
  const bytes = Uint8Array.from(secret.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16))
  return digest(bytes)
}

export function randomBackupCode(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('secure_crypto_unavailable')
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(8)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export async function secretFromBackupCode(backupCode: string): Promise<string> {
  return sha256(backupCode.toUpperCase())
}

export async function newCardCredentials(): Promise<{ secret: string; backupCode: string }> {
  const backupCode = randomBackupCode()
  return { backupCode, secret: await secretFromBackupCode(backupCode) }
}
