import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-logs-repo')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
})

describe('logs.repo', () => {
  it('logs and lists a request', async () => {
    const { logRequest, listLogs } = await import('../src/lib/logs.repo')
    logRequest({ credentialId: null, providerSlug: 'helius', statusCode: 200, durationMs: 42 })
    const logs = listLogs({})
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ providerSlug: 'helius', statusCode: 200, durationMs: 42 })
  })

  it('filters by providerSlug and statusCode', async () => {
    const { logRequest, listLogs } = await import('../src/lib/logs.repo')
    logRequest({ credentialId: null, providerSlug: 'helius', statusCode: 200, durationMs: 10 })
    logRequest({ credentialId: null, providerSlug: 'jupiter', statusCode: 429, durationMs: 20 })
    const filtered = listLogs({ providerSlug: 'jupiter' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].providerSlug).toBe('jupiter')
  })

  it('pruneLogsOlderThan removes logs past the retention window', async () => {
    const { logRequest, listLogs, pruneLogsOlderThan } = await import('../src/lib/logs.repo')
    const { getDb } = await import('../src/lib/db')
    logRequest({ credentialId: null, providerSlug: 'helius', statusCode: 200, durationMs: 10 })
    getDb()
      .prepare("UPDATE request_logs SET created_at = datetime('now', '-40 days')")
      .run()
    pruneLogsOlderThan(30)
    expect(listLogs({})).toHaveLength(0)
  })
})
