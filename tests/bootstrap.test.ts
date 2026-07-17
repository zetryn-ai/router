import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-bootstrap')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
  process.env.ROUTER_SECRET_KEY = '0'.repeat(64)
  process.env.JWT_SECRET = 'test-jwt-secret'
})

describe('runBootstrap', () => {
  it('seeds 5 default providers', async () => {
    const { runBootstrap } = await import('../src/lib/bootstrap')
    const { listProviders } = await import('../src/lib/providers.repo')
    runBootstrap()
    expect(listProviders()).toHaveLength(5)
  })

  it('sets a default password hash only if unset', async () => {
    const { runBootstrap } = await import('../src/lib/bootstrap')
    const { getSetting, setSetting } = await import('../src/lib/settings.repo')
    const { verifyPassword, DEFAULT_PASSWORD } = await import('../src/lib/auth')

    runBootstrap()
    const hash1 = getSetting('dashboard_password_hash')
    expect(hash1).toBeDefined()
    expect(verifyPassword(DEFAULT_PASSWORD, hash1!)).toBe(true)

    setSetting('dashboard_password_hash', 'custom-hash-should-not-change')
    runBootstrap()
    expect(getSetting('dashboard_password_hash')).toBe('custom-hash-should-not-change')
  })

  it('is idempotent — running twice does not duplicate providers', async () => {
    const { runBootstrap } = await import('../src/lib/bootstrap')
    const { listProviders } = await import('../src/lib/providers.repo')
    runBootstrap()
    runBootstrap()
    expect(listProviders()).toHaveLength(5)
  })
})
