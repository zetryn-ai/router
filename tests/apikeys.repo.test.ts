import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-apikeys-repo')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
  process.env.JWT_SECRET = 'test-jwt'
})

describe('apikeys.repo', () => {
  it('creates a key, returns plaintext once, stores only a hash + prefix', async () => {
    const { createApiKey, listApiKeys } = await import('../src/lib/apikeys.repo')
    const { record, plaintext } = createApiKey('bot-1')
    expect(plaintext).toMatch(/^zr_[0-9a-f]{32}$/)
    expect(record.label).toBe('bot-1')
    expect(record.keyPrefix).toBe(plaintext.slice(0, 8))
    const { getDb } = await import('../src/lib/db')
    const row = getDb().prepare('SELECT key_hash FROM api_keys WHERE id = ?').get(record.id) as { key_hash: string }
    expect(row.key_hash).not.toContain(plaintext)
    expect(listApiKeys()).toHaveLength(1)
  })

  it('verifyApiKey accepts a valid key and rejects a bad one', async () => {
    const { createApiKey, verifyApiKey } = await import('../src/lib/apikeys.repo')
    const { plaintext } = createApiKey('bot-1')
    expect(verifyApiKey(plaintext)).toBe(true)
    expect(verifyApiKey('zr_' + '0'.repeat(32))).toBe(false)
  })

  it('deleteApiKey removes it and revokes access', async () => {
    const { createApiKey, deleteApiKey, verifyApiKey, listApiKeys } = await import('../src/lib/apikeys.repo')
    const { record, plaintext } = createApiKey('bot-1')
    deleteApiKey(record.id)
    expect(listApiKeys()).toHaveLength(0)
    expect(verifyApiKey(plaintext)).toBe(false)
  })
})
