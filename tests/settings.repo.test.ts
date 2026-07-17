import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-settings-repo')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
})

describe('settings.repo', () => {
  it('returns undefined for an unset key', async () => {
    const { getSetting } = await import('../src/lib/settings.repo')
    expect(getSetting('nonexistent')).toBeUndefined()
  })

  it('sets and gets a value, and overwrites on repeated set', async () => {
    const { getSetting, setSetting } = await import('../src/lib/settings.repo')
    setSetting('cooldown_seconds_default:helius', '60')
    expect(getSetting('cooldown_seconds_default:helius')).toBe('60')
    setSetting('cooldown_seconds_default:helius', '90')
    expect(getSetting('cooldown_seconds_default:helius')).toBe('90')
  })
})
