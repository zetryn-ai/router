import { describe, it, expect, beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  process.env.ROUTER_SECRET_KEY = '0'.repeat(64) // 32 bytes hex
})

describe('encryptSecret/decryptSecret', () => {
  it('round-trips a plaintext string', async () => {
    const { encryptSecret, decryptSecret } = await import('../src/lib/crypto')
    const plaintext = 'my-super-secret-api-key'
    const encrypted = encryptSecret(plaintext)
    expect(encrypted).not.toBe(plaintext)
    expect(decryptSecret(encrypted)).toBe(plaintext)
  })

  it('produces different ciphertext for the same plaintext each time', async () => {
    const { encryptSecret } = await import('../src/lib/crypto')
    const a = encryptSecret('same-value')
    const b = encryptSecret('same-value')
    expect(a).not.toBe(b)
  })

  it('throws at module load if ROUTER_SECRET_KEY is missing', async () => {
    vi.resetModules()
    delete process.env.ROUTER_SECRET_KEY
    await expect(import('../src/lib/crypto')).rejects.toThrow('ROUTER_SECRET_KEY')
  })
})
