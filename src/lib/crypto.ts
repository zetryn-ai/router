import crypto from 'node:crypto'

const rawKey = process.env.ROUTER_SECRET_KEY
if (!rawKey) {
  throw new Error('ROUTER_SECRET_KEY is not set — refusing to start without an encryption key')
}

function resolveKey(): Buffer {
  // Accept 64-char hex (32 bytes) or fall back to hashing an arbitrary string to 32 bytes.
  if (/^[0-9a-fA-F]{64}$/.test(rawKey!)) {
    return Buffer.from(rawKey!, 'hex')
  }
  return crypto.createHash('sha256').update(rawKey!).digest()
}

const key = resolveKey()
const ALGO = 'aes-256-gcm'

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decryptSecret(ciphertext: string): string {
  const data = Buffer.from(ciphertext, 'base64')
  const iv = data.subarray(0, 12)
  const authTag = data.subarray(12, 28)
  const encrypted = data.subarray(28)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8')
}
