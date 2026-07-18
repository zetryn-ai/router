import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-provider-models-route')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
})

function makeRequest(method: string, body: unknown) {
  return new Request('http://localhost/api/providers/llm-p/models', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

async function seedLlmProvider() {
  const { createProvider } = await import('../src/lib/providers.repo')
  return createProvider({
    slug: 'llm-p',
    name: 'LLM P',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: 'Authorization',
    defaultBaseUrl: 'https://api.example.com',
    isLlm: true,
    models: ['model-a'],
  })
}

describe('provider models route', () => {
  it('POST adds a model to an LLM provider', async () => {
    await seedLlmProvider()
    const { POST } = await import('../src/app/api/providers/[slug]/models/route')
    const res = await POST(makeRequest('POST', { model: 'model-b' }), { params: Promise.resolve({ slug: 'llm-p' }) })
    expect(res.status).toBe(200)
    const { getProviderBySlug } = await import('../src/lib/providers.repo')
    expect(getProviderBySlug('llm-p')!.models).toEqual(['model-a', 'model-b'])
  })

  it('POST rejects with 400 for a non-LLM provider', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    createProvider({
      slug: 'rpc-p', name: 'RPC P', defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY', defaultBaseUrl: 'https://api.example.com',
    })
    const { POST } = await import('../src/app/api/providers/[slug]/models/route')
    const req = new Request('http://localhost/api/providers/rpc-p/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'model-x' }),
    }) as unknown as import('next/server').NextRequest
    const res = await POST(req, { params: Promise.resolve({ slug: 'rpc-p' }) })
    expect(res.status).toBe(400)
  })

  it('POST rejects with 404 for an unknown provider slug', async () => {
    const { POST } = await import('../src/app/api/providers/[slug]/models/route')
    const res = await POST(makeRequest('POST', { model: 'model-b' }), {
      params: Promise.resolve({ slug: 'does-not-exist' }),
    })
    expect(res.status).toBe(404)
  })

  it('DELETE removes a model from an LLM provider', async () => {
    await seedLlmProvider()
    const { DELETE } = await import('../src/app/api/providers/[slug]/models/route')
    const res = await DELETE(makeRequest('DELETE', { model: 'model-a' }), {
      params: Promise.resolve({ slug: 'llm-p' }),
    })
    expect(res.status).toBe(200)
    const { getProviderBySlug } = await import('../src/lib/providers.repo')
    expect(getProviderBySlug('llm-p')!.models).toEqual([])
  })
})
