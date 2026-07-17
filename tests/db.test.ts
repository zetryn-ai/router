import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-db')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
})

describe('getDb', () => {
  it('creates all expected tables', async () => {
    const { getDb } = await import('../src/lib/db')
    const db = getDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining(['providers', 'credentials', 'request_logs', 'settings'])
    )
  })

  it('returns the same instance on repeated calls (singleton)', async () => {
    const { getDb } = await import('../src/lib/db')
    const db1 = getDb()
    const db2 = getDb()
    expect(db1).toBe(db2)
  })

  it('applies migration 002 columns (rotation_strategy, priority, value template)', async () => {
    const { getDb } = await import('../src/lib/db')
    const db = getDb()
    const providerCols = (db.prepare('PRAGMA table_info(providers)').all() as { name: string }[]).map(
      (c) => c.name
    )
    const credentialCols = (
      db.prepare('PRAGMA table_info(credentials)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(providerCols).toEqual(
      expect.arrayContaining(['rotation_strategy', 'default_inject_value_template'])
    )
    expect(credentialCols).toEqual(expect.arrayContaining(['priority']))
  })

  it('records applied migrations and does not reapply them', async () => {
    const { getDb } = await import('../src/lib/db')
    const db = getDb()
    const applied = (
      db.prepare('SELECT filename FROM schema_migrations ORDER BY filename').all() as {
        filename: string
      }[]
    ).map((r) => r.filename)
    expect(applied).toContain('001_init.sql')
    expect(applied).toContain('002_rotation.sql')
  })
})
