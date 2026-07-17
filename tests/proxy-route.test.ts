import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-proxy-route')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
  process.env.ROUTER_SECRET_KEY = '0'.repeat(64)
})

async function setupProviderWithTwoCredentials() {
  const { createProvider } = await import('../src/lib/providers.repo')
  const { createCredential } = await import('../src/lib/credentials.repo')
  const provider = createProvider({
    slug: 'test-p',
    name: 'Test P',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: 'X-API-KEY',
    defaultBaseUrl: 'https://api.example.com',
  })
  const credA = createCredential({ providerId: provider.id, label: 'a', secretValue: 'secret-a' })
  const credB = createCredential({ providerId: provider.id, label: 'b', secretValue: 'secret-b' })
  return { provider, credA, credB }
}

describe('handleProxyRequest', () => {
  it('returns the upstream response on first-try success', async () => {
    const { provider } = await setupProviderWithTwoCredentials()
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')

    const fetchFn = vi.fn().mockResolvedValue(new Response('ok-body', { status: 200 }))
    const result = await handleProxyRequest({
      slug: provider.slug,
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })

    expect(result.status).toBe(200)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 with the next credential, then succeeds', async () => {
    const { provider } = await setupProviderWithTwoCredentials()
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok-body', { status: 200 }))

    const result = await handleProxyRequest({
      slug: provider.slug,
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })

    expect(result.status).toBe(200)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('marks the 429 credential as cooldown', async () => {
    const { provider } = await setupProviderWithTwoCredentials()
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')
    const { listCredentialsByProvider } = await import('../src/lib/credentials.repo')

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok-body', { status: 200 }))

    await handleProxyRequest({
      slug: provider.slug,
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })

    const creds = listCredentialsByProvider(provider.id)
    expect(creds.filter((c) => c.status === 'cooldown')).toHaveLength(1)
    expect(creds.filter((c) => c.status === 'active')).toHaveLength(1)
  })

  it('marks credential as error (not cooldown) on 401 and moves to next credential', async () => {
    const { provider } = await setupProviderWithTwoCredentials()
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')
    const { listCredentialsByProvider } = await import('../src/lib/credentials.repo')

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('ok-body', { status: 200 }))

    const result = await handleProxyRequest({
      slug: provider.slug,
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })

    expect(result.status).toBe(200)
    const creds = listCredentialsByProvider(provider.id)
    expect(creds.filter((c) => c.status === 'error')).toHaveLength(1)
    expect(creds.find((c) => c.status === 'error')?.lastError).toBe('HTTP 401')
  })

  it('returns 502 when all credentials are exhausted', async () => {
    const { provider } = await setupProviderWithTwoCredentials()
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')

    const fetchFn = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }))

    const result = await handleProxyRequest({
      slug: provider.slug,
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })

    expect(result.status).toBe(502)
    expect(result.body).toMatchObject({ provider: provider.slug, triedCredentials: 2 })
  })

  it('treats network errors as transient (cooldown + retry)', async () => {
    const { provider } = await setupProviderWithTwoCredentials()
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')

    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(new Response('ok-body', { status: 200 }))

    const result = await handleProxyRequest({
      slug: provider.slug,
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })

    expect(result.status).toBe(200)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('returns 503 immediately when the provider has no credentials at all', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const provider = createProvider({
      slug: 'empty-p',
      name: 'Empty P',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://api.example.com',
    })
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')
    const fetchFn = vi.fn()

    const result = await handleProxyRequest({
      slug: provider.slug,
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })

    expect(result.status).toBe(503)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns 404 when the provider slug does not exist', async () => {
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')
    const fetchFn = vi.fn()
    const result = await handleProxyRequest({
      slug: 'does-not-exist',
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })
    expect(result.status).toBe(404)
  })

  it('logs each attempt to request_logs', async () => {
    const { provider } = await setupProviderWithTwoCredentials()
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')
    const { listLogs } = await import('../src/lib/logs.repo')

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok-body', { status: 200 }))

    await handleProxyRequest({
      slug: provider.slug,
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })

    const logs = listLogs({ providerSlug: provider.slug })
    expect(logs).toHaveLength(2)
    const codes = logs.map((l) => l.statusCode).sort()
    expect(codes).toEqual([200, 429])
  })
})
