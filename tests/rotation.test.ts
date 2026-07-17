import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-rotation')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
  process.env.ROUTER_SECRET_KEY = '0'.repeat(64)
})

describe('pickNextCredential', () => {
  it('returns null when there are no credentials', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const { pickNextCredential } = await import('../src/lib/rotation')
    const provider = createProvider({
      slug: 'p1',
      name: 'P1',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://api.example.com',
    })
    expect(pickNextCredential(provider.id)).toBeNull()
  })

  it('cycles through active credentials round-robin', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const { createCredential } = await import('../src/lib/credentials.repo')
    const { pickNextCredential } = await import('../src/lib/rotation')
    const provider = createProvider({
      slug: 'p2',
      name: 'P2',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://api.example.com',
    })
    const a = createCredential({ providerId: provider.id, label: 'a', secretValue: 'sa' })
    const b = createCredential({ providerId: provider.id, label: 'b', secretValue: 'sb' })

    const picks = [
      pickNextCredential(provider.id)?.id,
      pickNextCredential(provider.id)?.id,
      pickNextCredential(provider.id)?.id,
    ]
    // must alternate between the two, in some consistent cyclical order
    expect(picks[0]).not.toBe(picks[1])
    expect(picks[0]).toBe(picks[2])
    expect([a.id, b.id]).toEqual(expect.arrayContaining([picks[0], picks[1]]))
  })

  it('skips disabled and error credentials, and cooldown credentials whose time has not passed', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const { createCredential, markDisabled, markError, markCooldown } = await import(
      '../src/lib/credentials.repo'
    )
    const { pickNextCredential } = await import('../src/lib/rotation')
    const provider = createProvider({
      slug: 'p3',
      name: 'P3',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://api.example.com',
    })
    const disabled = createCredential({ providerId: provider.id, label: 'disabled', secretValue: 's1' })
    const errored = createCredential({ providerId: provider.id, label: 'errored', secretValue: 's2' })
    const cooling = createCredential({ providerId: provider.id, label: 'cooling', secretValue: 's3' })
    const healthy = createCredential({ providerId: provider.id, label: 'healthy', secretValue: 's4' })
    markDisabled(disabled.id)
    markError(errored.id, 'bad key')
    markCooldown(cooling.id, 300)

    const pick = pickNextCredential(provider.id)
    expect(pick?.id).toBe(healthy.id)
  })
})
