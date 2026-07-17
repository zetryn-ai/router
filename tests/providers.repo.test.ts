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
    const slugs = listProviders().map((p) => p.slug).sort()
    expect(slugs).toEqual([
      'anthropic',
      'birdeye',
      'dexscreener',
      'gemini',
      'helius',
      'jupiter',
      'openai',
      'quicknode',
    ])
  })

  it('seeds LLM providers with priority strategy and value templates', async () => {
    const { seedDefaultProviders, getProviderBySlug } = await import('../src/lib/providers.repo')
    seedDefaultProviders()
    const openai = getProviderBySlug('openai')
    expect(openai).toMatchObject({
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'Authorization',
      defaultInjectValueTemplate: 'Bearer {key}',
      rotationStrategy: 'priority',
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

  it('seeds providers with categories and marks LLM providers', async () => {
    const { seedDefaultProviders, getProviderBySlug } = await import('../src/lib/providers.repo')
    seedDefaultProviders()
    expect(getProviderBySlug('helius')).toMatchObject({ category: 'rpc', isLlm: false })
    expect(getProviderBySlug('birdeye')).toMatchObject({ category: 'data', isLlm: false })
    expect(getProviderBySlug('jupiter')).toMatchObject({ category: 'swap', isLlm: false })
    const openai = getProviderBySlug('openai')!
    expect(openai.category).toBe('llm')
    expect(openai.isLlm).toBe(true)
    expect(openai.models).toEqual(expect.arrayContaining(['gpt-4o', 'gpt-4o-mini']))
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
