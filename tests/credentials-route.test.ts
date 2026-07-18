import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-credentials-route')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
  process.env.ROUTER_SECRET_KEY = '0'.repeat(64)
})

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

describe('POST /api/credentials — base URL override requirement', () => {
  it('rejects with 400 when the provider is path-injected and no override is given', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const provider = createProvider({
      slug: 'path-provider',
      name: 'Path Provider',
      defaultInjectLocation: 'path',
      defaultInjectKeyName: null,
      defaultBaseUrl: 'https://shared.example.com', // has a default, but path injection still requires override
    })
    const { POST } = await import('../src/app/api/credentials/route')
    const res = await POST(makeRequest({ providerId: provider.id, label: 'k1', secretValue: 'secret' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/base URL override is required/i)
  })

  it('rejects with 400 when the provider has no default base URL at all, even if header/query injected', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const provider = createProvider({
      slug: 'no-default-url',
      name: 'No Default URL',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: null,
    })
    const { POST } = await import('../src/app/api/credentials/route')
    const res = await POST(makeRequest({ providerId: provider.id, label: 'k1', secretValue: 'secret' }))
    expect(res.status).toBe(400)
  })

  it('accepts a path-injected provider when base URL override is provided', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const provider = createProvider({
      slug: 'path-provider-2',
      name: 'Path Provider 2',
      defaultInjectLocation: 'path',
      defaultInjectKeyName: null,
      defaultBaseUrl: null,
    })
    const { POST } = await import('../src/app/api/credentials/route')
    const res = await POST(
      makeRequest({
        providerId: provider.id,
        label: 'k1',
        secretValue: 'secret',
        baseUrlOverride: 'https://solana-mainnet.g.alchemy.com/v2/abc123',
      })
    )
    expect(res.status).toBe(201)
  })

  it('accepts a header-injected provider with a shared default base URL and no override', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const provider = createProvider({
      slug: 'header-provider',
      name: 'Header Provider',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://shared.example.com',
    })
    const { POST } = await import('../src/app/api/credentials/route')
    const res = await POST(makeRequest({ providerId: provider.id, label: 'k1', secretValue: 'secret' }))
    expect(res.status).toBe(201)
  })

  it('rejects with 400 for an unknown providerId', async () => {
    const { POST } = await import('../src/app/api/credentials/route')
    const res = await POST(makeRequest({ providerId: 999999, label: 'k1', secretValue: 'secret' }))
    expect(res.status).toBe(400)
  })
})
