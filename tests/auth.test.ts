import { describe, it, expect, beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  process.env.JWT_SECRET = 'test-jwt-secret-for-vitest-only'
})

describe('auth', () => {
  it('hashPassword produces a hash different from the plaintext, verifyPassword confirms match', async () => {
    const { hashPassword, verifyPassword } = await import('../src/lib/auth')
    const hash = hashPassword('correct-horse-battery-staple')
    expect(hash).not.toBe('correct-horse-battery-staple')
    expect(verifyPassword('correct-horse-battery-staple', hash)).toBe(true)
    expect(verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('createSessionToken produces a token that verifySessionToken accepts', async () => {
    const { createSessionToken, verifySessionToken } = await import('../src/lib/auth')
    const token = await createSessionToken()
    expect(await verifySessionToken(token)).toBe(true)
  })

  it('verifySessionToken rejects a garbage token', async () => {
    const { verifySessionToken } = await import('../src/lib/auth')
    expect(await verifySessionToken('not-a-real-token')).toBe(false)
  })
})
