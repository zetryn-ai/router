import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-credentials-repo')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
  process.env.ROUTER_SECRET_KEY = '0'.repeat(64)
})

async function setup() {
  const { createProvider } = await import('../src/lib/providers.repo')
  const { createCredential, listCredentialsByProvider } = await import('../src/lib/credentials.repo')
  const provider = createProvider({
    slug: 'test-provider',
    name: 'Test Provider',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: 'X-API-KEY',
    defaultBaseUrl: 'https://api.example.com',
  })
  return { provider, createCredential, listCredentialsByProvider }
}

describe('credentials.repo', () => {
  it('creates a credential and stores the secret encrypted, decrypted on read', async () => {
    const { provider, createCredential, listCredentialsByProvider } = await setup()
    createCredential({ providerId: provider.id, label: 'acc-1', secretValue: 'plain-secret-123' })
    const list = listCredentialsByProvider(provider.id)
    expect(list).toHaveLength(1)
    expect(list[0].secretValue).toBe('plain-secret-123')
    expect(list[0].status).toBe('active')
  })

  it('stores raw db value encrypted (not equal to plaintext)', async () => {
    const { provider, createCredential } = await setup()
    const created = createCredential({ providerId: provider.id, label: 'acc-1', secretValue: 'plain-secret-123' })
    const { getDb } = await import('../src/lib/db')
    const row = getDb().prepare('SELECT secret_value FROM credentials WHERE id = ?').get(created.id) as {
      secret_value: string
    }
    expect(row.secret_value).not.toBe('plain-secret-123')
  })

  it('markCooldown sets status and cooldown_until in the future', async () => {
    const { provider, createCredential, listCredentialsByProvider } = await setup()
    const { markCooldown } = await import('../src/lib/credentials.repo')
    const cred = createCredential({ providerId: provider.id, label: 'acc-1', secretValue: 'secret' })
    markCooldown(cred.id, 60)
    const [updated] = listCredentialsByProvider(provider.id)
    expect(updated.status).toBe('cooldown')
    expect(updated.cooldownUntil).not.toBeNull()
    expect(new Date(updated.cooldownUntil! + 'Z').getTime()).toBeGreaterThan(Date.now())
  })

  it('markError sets status to error and records last_error, does not set cooldown_until', async () => {
    const { provider, createCredential, listCredentialsByProvider } = await setup()
    const { markError } = await import('../src/lib/credentials.repo')
    const cred = createCredential({ providerId: provider.id, label: 'acc-1', secretValue: 'secret' })
    markError(cred.id, 'HTTP 401 invalid key')
    const [updated] = listCredentialsByProvider(provider.id)
    expect(updated.status).toBe('error')
    expect(updated.lastError).toBe('HTTP 401 invalid key')
    expect(updated.cooldownUntil).toBeNull()
  })

  it('reactivateExpiredCooldowns flips only expired cooldowns back to active', async () => {
    const { provider, createCredential, listCredentialsByProvider } = await setup()
    const { markCooldown, reactivateExpiredCooldowns } = await import('../src/lib/credentials.repo')
    const { getDb } = await import('../src/lib/db')
    const expired = createCredential({ providerId: provider.id, label: 'expired', secretValue: 's1' })
    const active = createCredential({ providerId: provider.id, label: 'still-cooling', secretValue: 's2' })
    markCooldown(expired.id, 60)
    markCooldown(active.id, 60)
    // force the "expired" one into the past directly via SQL
    getDb()
      .prepare("UPDATE credentials SET cooldown_until = datetime('now', '-10 seconds') WHERE id = ?")
      .run(expired.id)

    reactivateExpiredCooldowns(provider.id)

    const list = listCredentialsByProvider(provider.id)
    const expiredRow = list.find((c) => c.id === expired.id)!
    const activeRow = list.find((c) => c.id === active.id)!
    expect(expiredRow.status).toBe('active')
    expect(activeRow.status).toBe('cooldown')
  })
})
