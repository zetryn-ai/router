import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-combo-orch')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
  process.env.ROUTER_SECRET_KEY = '0'.repeat(64)
  process.env.JWT_SECRET = 'test-jwt'
})

async function seedLlm() {
  const { createProvider } = await import('../src/lib/providers.repo')
  const { createCredential } = await import('../src/lib/credentials.repo')
  const { createCombo } = await import('../src/lib/combos.repo')
  const openai = createProvider({
    slug: 'openai', name: 'OpenAI', defaultInjectLocation: 'header',
    defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}',
    defaultBaseUrl: 'https://api.openai.com', category: 'llm', isLlm: true, models: ['gpt-4o'],
  })
  const gemini = createProvider({
    slug: 'gemini', name: 'Gemini', defaultInjectLocation: 'query', defaultInjectKeyName: 'key',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com', category: 'llm', isLlm: true, models: ['gemini-2.5-flash'],
  })
  createCredential({ providerId: openai.id, label: 'o', secretValue: 'sk-o' })
  createCredential({ providerId: gemini.id, label: 'g', secretValue: 'sk-g' })
  createCombo({ name: 'combo1', strategy: 'fallback', models: ['openai/gpt-4o', 'gemini/gemini-2.5-flash'] })
}

describe('handleComboRequest', () => {
  it('returns 404 for an unknown combo', async () => {
    const { handleComboRequest } = await import('../src/lib/combo-orchestrator')
    const result = await handleComboRequest({
      comboName: 'nope', path: '/v1/chat/completions', query: new URLSearchParams(),
      method: 'POST', body: JSON.stringify({ messages: [] }), headers: {}, fetchFn: vi.fn(),
    })
    expect(result.status).toBe(404)
  })

  it('fallback: first member fails, second succeeds', async () => {
    await seedLlm()
    const { handleComboRequest } = await import('../src/lib/combo-orchestrator')
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const result = await handleComboRequest({
      comboName: 'combo1', path: '/v1/chat/completions', query: new URLSearchParams(),
      method: 'POST', body: JSON.stringify({ model: 'combo1', messages: [] }), headers: { 'content-type': 'application/json' },
      fetchFn,
    })
    expect(result.status).toBe(200)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('rewrites the body model field to the member model id', async () => {
    await seedLlm()
    const { handleComboRequest } = await import('../src/lib/combo-orchestrator')
    let capturedBody = ''
    const fetchFn = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = String(init.body)
      return Promise.resolve(new Response('ok', { status: 200 }))
    })
    await handleComboRequest({
      comboName: 'combo1', path: '/v1/chat/completions', query: new URLSearchParams(),
      method: 'POST', body: JSON.stringify({ model: 'combo1', messages: [] }), headers: { 'content-type': 'application/json' },
      fetchFn,
    })
    expect(JSON.parse(capturedBody).model).toBe('gpt-4o')
  })
})
