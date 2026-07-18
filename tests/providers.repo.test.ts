import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-providers-repo')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
})

describe('providers.repo', () => {
  it('creates and lists a custom provider', async () => {
    const { createProvider, listProviders } = await import('../src/lib/providers.repo')
    createProvider({
      slug: 'custom-rpc',
      name: 'Custom RPC',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://custom.example.com',
    })
    const providers = listProviders()
    expect(providers).toHaveLength(1)
    expect(providers[0]).toMatchObject({ slug: 'custom-rpc', name: 'Custom RPC' })
  })

  it('seeds exactly the default providers, idempotently', async () => {
    const { seedDefaultProviders, listProviders } = await import('../src/lib/providers.repo')
    seedDefaultProviders()
    seedDefaultProviders() // calling twice must not duplicate
    const providers = listProviders()
    const slugs = providers.map((p) => p.slug)
    // core Solana providers present
    expect(slugs).toEqual(
      expect.arrayContaining(['helius', 'quicknode', 'birdeye', 'dexscreener', 'jupiter'])
    )
    // AI-only-free rule: free LLM providers seeded, pure-paid ones omitted
    expect(slugs).toEqual(expect.arrayContaining(['groq', 'gemini', 'openrouter', 'cerebras']))
    expect(slugs).not.toContain('openai')
    expect(slugs).not.toContain('anthropic')
    // idempotent — no duplicate slugs
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('seeds free LLM providers with priority strategy and value templates', async () => {
    const { seedDefaultProviders, getProviderBySlug } = await import('../src/lib/providers.repo')
    seedDefaultProviders()
    const groq = getProviderBySlug('groq')
    expect(groq).toMatchObject({
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'Authorization',
      defaultInjectValueTemplate: 'Bearer {key}',
      rotationStrategy: 'priority',
      isLlm: true,
      isFree: true,
    })
    // Solana/data providers keep the default round_robin strategy
    expect(getProviderBySlug('helius')?.rotationStrategy).toBe('round_robin')
  })

  it('seeds helius with query-param injection', async () => {
    const { seedDefaultProviders, getProviderBySlug } = await import('../src/lib/providers.repo')
    seedDefaultProviders()
    const helius = getProviderBySlug('helius')
    expect(helius).toMatchObject({
      defaultInjectLocation: 'query',
      defaultInjectKeyName: 'api-key',
      defaultBaseUrl: 'https://mainnet.helius-rpc.com',
    })
  })

  it('seeds quicknode with path injection and null default base url', async () => {
    const { seedDefaultProviders, getProviderBySlug } = await import('../src/lib/providers.repo')
    seedDefaultProviders()
    const qn = getProviderBySlug('quicknode')
    expect(qn).toMatchObject({
      defaultInjectLocation: 'path',
      defaultBaseUrl: null,
    })
  })

  it('seeds providers with categories, marks LLM + free providers', async () => {
    const { seedDefaultProviders, getProviderBySlug } = await import('../src/lib/providers.repo')
    seedDefaultProviders()
    expect(getProviderBySlug('helius')).toMatchObject({ category: 'rpc', isLlm: false, isFree: true })
    expect(getProviderBySlug('birdeye')).toMatchObject({ category: 'data', isLlm: false, isFree: false })
    expect(getProviderBySlug('jupiter')).toMatchObject({ category: 'swap', isLlm: false, isFree: true })
    const groq = getProviderBySlug('groq')!
    expect(groq.category).toBe('llm')
    expect(groq.isLlm).toBe(true)
    expect(groq.isFree).toBe(true)
    expect(groq.models).toEqual(expect.arrayContaining(['llama-3.3-70b-versatile']))
  })

  it('backfills category/isLlm/models/isFree onto a pre-existing default provider (upgrade path)', async () => {
    const { createProvider, seedDefaultProviders, getProviderBySlug } = await import('../src/lib/providers.repo')
    // Simulate 'groq' seeded before the metadata columns existed:
    // created with defaults (category 'other', isLlm false, not free).
    createProvider({
      slug: 'groq', name: 'Groq', defaultInjectLocation: 'header',
      defaultInjectKeyName: 'Authorization', defaultBaseUrl: 'https://api.groq.com/openai/v1',
    })
    expect(getProviderBySlug('groq')!.isLlm).toBe(false)
    seedDefaultProviders()
    const upgraded = getProviderBySlug('groq')!
    expect(upgraded.isLlm).toBe(true)
    expect(upgraded.category).toBe('llm')
    expect(upgraded.isFree).toBe(true)
    expect(upgraded.models).toEqual(expect.arrayContaining(['llama-3.3-70b-versatile']))
    expect(upgraded.defaultInjectValueTemplate).toBe('Bearer {key}')
  })

  it('setStickyLimit updates the value', async () => {
    const { createProvider, getProviderBySlug, setStickyLimit } = await import('../src/lib/providers.repo')
    const p = createProvider({
      slug: 'sticky-p', name: 'Sticky', defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY', defaultBaseUrl: 'https://api.example.com',
    })
    setStickyLimit(p.id, 5)
    expect(getProviderBySlug('sticky-p')!.stickyLimit).toBe(5)
  })
})
