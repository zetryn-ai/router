import { describe, it, expect } from 'vitest'
import type { Provider } from '../src/lib/providers.repo'
import type { Credential } from '../src/lib/credentials.repo'

// rotation.ts transitively loads crypto.ts, which requires this env var at module load
process.env.ROUTER_SECRET_KEY ??= '0'.repeat(64)
const { resolveTarget } = await import('../src/lib/rotation')

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 1,
    slug: 'helius',
    name: 'Helius',
    defaultInjectLocation: 'query',
    defaultInjectKeyName: 'api-key',
    defaultBaseUrl: 'https://mainnet.helius-rpc.com',
    createdAt: '2026-01-01',
    ...overrides,
  }
}

function makeCredential(overrides: Partial<Credential> = {}): Credential {
  return {
    id: 1,
    providerId: 1,
    label: 'acc-1',
    baseUrlOverride: null,
    secretValue: 'SECRET123',
    injectLocationOverride: null,
    injectKeyNameOverride: null,
    status: 'active',
    cooldownUntil: null,
    lastUsedAt: null,
    lastError: null,
    createdAt: '2026-01-01',
    ...overrides,
  }
}

describe('resolveTarget', () => {
  it('injects key as query param using provider default base url (helius-style)', () => {
    const provider = makeProvider()
    const credential = makeCredential()
    const result = resolveTarget(provider, credential, '/', new URLSearchParams())
    expect(result.url).toBe('https://mainnet.helius-rpc.com/?api-key=SECRET123')
    expect(result.headers).toEqual({})
  })

  it('injects key as header using provider default base url (birdeye-style)', () => {
    const provider = makeProvider({
      slug: 'birdeye',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://public-api.birdeye.so',
    })
    const credential = makeCredential({ secretValue: 'BIRDEYE_KEY' })
    const result = resolveTarget(provider, credential, '/defi/price', new URLSearchParams('address=abc'))
    expect(result.url).toBe('https://public-api.birdeye.so/defi/price?address=abc')
    expect(result.headers).toEqual({ 'X-API-KEY': 'BIRDEYE_KEY' })
  })

  it('uses credential base_url_override when provider has no default (quicknode-style path injection)', () => {
    const provider = makeProvider({
      slug: 'quicknode',
      defaultInjectLocation: 'path',
      defaultInjectKeyName: null,
      defaultBaseUrl: null,
    })
    const credential = makeCredential({
      baseUrlOverride: 'https://my-endpoint.solana-mainnet.quiknode.pro/abc123token',
    })
    const result = resolveTarget(provider, credential, '/', new URLSearchParams())
    expect(result.url).toBe('https://my-endpoint.solana-mainnet.quiknode.pro/abc123token/')
    expect(result.headers).toEqual({})
  })

  it('credential-level override wins over provider default for inject location', () => {
    const provider = makeProvider({
      slug: 'jupiter',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'x-api-key',
      defaultBaseUrl: null,
    })
    const credential = makeCredential({
      baseUrlOverride: 'https://api.jup.ag',
      secretValue: 'JUP_KEY',
    })
    const result = resolveTarget(provider, credential, '/swap/v1/quote', new URLSearchParams('inputMint=abc'))
    expect(result.url).toBe('https://api.jup.ag/swap/v1/quote?inputMint=abc')
    expect(result.headers).toEqual({ 'x-api-key': 'JUP_KEY' })
  })

  it('throws a clear error when no base url is available from either provider or credential', () => {
    const provider = makeProvider({ defaultBaseUrl: null })
    const credential = makeCredential({ baseUrlOverride: null })
    expect(() => resolveTarget(provider, credential, '/', new URLSearchParams())).toThrow(
      /no base url configured/i
    )
  })
})
