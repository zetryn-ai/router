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
    expect(pickNextCredential(provider)).toBeNull()
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
      pickNextCredential(provider)?.id,
      pickNextCredential(provider)?.id,
      pickNextCredential(provider)?.id,
    ]
    expect(picks[0]).not.toBe(picks[1])
    expect(picks[0]).toBe(picks[2])
    expect([a.id, b.id]).toEqual(expect.arrayContaining([picks[0], picks[1]]))
  })

  it('sticky round-robin repeats the same credential stickyLimit times before advancing', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const { createCredential } = await import('../src/lib/credentials.repo')
    const { pickNextCredential } = await import('../src/lib/rotation')
    const provider = createProvider({
      slug: 'sticky-rr', name: 'StickyRR', defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY', defaultBaseUrl: 'https://api.example.com',
      stickyLimit: 2,
    })
    createCredential({ providerId: provider.id, label: 'a', secretValue: 's1' })
    createCredential({ providerId: provider.id, label: 'b', secretValue: 's2' })
    const picks = [
      pickNextCredential(provider)!.label,
      pickNextCredential(provider)!.label,
      pickNextCredential(provider)!.label,
      pickNextCredential(provider)!.label,
    ]
    // stickyLimit=2 → a,a,b,b
    expect(picks[0]).toBe(picks[1])
    expect(picks[2]).toBe(picks[3])
    expect(picks[0]).not.toBe(picks[2])
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

    const pick = pickNextCredential(provider)
    expect(pick?.id).toBe(healthy.id)
  })

  it('LRU strategy always picks the credential with the oldest last_used_at (null first)', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const { createCredential, touchLastUsed } = await import('../src/lib/credentials.repo')
    const { pickNextCredential } = await import('../src/lib/rotation')
    const provider = createProvider({
      slug: 'lru-p',
      name: 'LRU',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://api.example.com',
      rotationStrategy: 'lru',
    })
    const a = createCredential({ providerId: provider.id, label: 'a', secretValue: 's1' })
    const b = createCredential({ providerId: provider.id, label: 'b', secretValue: 's2' })

    // a has been used; b never has → b (null last_used_at) should come first
    touchLastUsed(a.id)
    const first = pickNextCredential(provider)
    expect(first?.id).toBe(b.id)
  })

  it('priority strategy picks the lowest priority number first, ties broken by oldest use', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const { createCredential } = await import('../src/lib/credentials.repo')
    const { pickNextCredential } = await import('../src/lib/rotation')
    const provider = createProvider({
      slug: 'prio-p',
      name: 'PRIO',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://api.example.com',
      rotationStrategy: 'priority',
    })
    createCredential({ providerId: provider.id, label: 'low-prio', secretValue: 's1', priority: 100 })
    const premium = createCredential({
      providerId: provider.id,
      label: 'premium',
      secretValue: 's2',
      priority: 1,
    })

    const pick = pickNextCredential(provider)
    expect(pick?.id).toBe(premium.id)
  })
})

describe('resolveTarget with inject_value_template', () => {
  it('renders "Bearer {key}" for OpenAI-style Authorization header', async () => {
    process.env.ROUTER_SECRET_KEY ??= '0'.repeat(64)
    const { resolveTarget } = await import('../src/lib/rotation')
    const provider = {
      id: 1,
      slug: 'openai',
      name: 'OpenAI',
      defaultInjectLocation: 'header' as const,
      defaultInjectKeyName: 'Authorization',
      defaultBaseUrl: 'https://api.openai.com',
      rotationStrategy: 'priority' as const,
      defaultInjectValueTemplate: 'Bearer {key}',
      createdAt: '2026-01-01',
    }
    const credential = {
      id: 1,
      providerId: 1,
      label: 'k1',
      baseUrlOverride: null,
      secretValue: 'sk-abc123',
      injectLocationOverride: null,
      injectKeyNameOverride: null,
      status: 'active' as const,
      cooldownUntil: null,
      lastUsedAt: null,
      lastError: null,
      priority: 1,
      createdAt: '2026-01-01',
    }
    const result = resolveTarget(provider, credential, '/v1/chat/completions', new URLSearchParams())
    expect(result.headers).toEqual({ Authorization: 'Bearer sk-abc123' })
  })
})
