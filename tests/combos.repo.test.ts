import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-combos-repo')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
})

describe('combos.repo', () => {
  it('creates and reads a combo with models and strategy', async () => {
    const { createCombo, getComboByName } = await import('../src/lib/combos.repo')
    createCombo({ name: 'combo1', strategy: 'fallback', models: ['openai/gpt-4o', 'gemini/gemini-2.5-flash'] })
    const c = getComboByName('combo1')!
    expect(c.strategy).toBe('fallback')
    expect(c.models).toEqual(['openai/gpt-4o', 'gemini/gemini-2.5-flash'])
  })

  it('updates strategy and models', async () => {
    const { createCombo, updateCombo, getComboByName } = await import('../src/lib/combos.repo')
    createCombo({ name: 'combo1', strategy: 'fallback', models: ['openai/gpt-4o'] })
    updateCombo('combo1', { strategy: 'round_robin', models: ['openai/gpt-4o', 'anthropic/claude-sonnet-5'] })
    const c = getComboByName('combo1')!
    expect(c.strategy).toBe('round_robin')
    expect(c.models).toHaveLength(2)
  })

  it('deletes a combo', async () => {
    const { createCombo, deleteCombo, listCombos } = await import('../src/lib/combos.repo')
    createCombo({ name: 'combo1', strategy: 'fallback', models: ['openai/gpt-4o'] })
    deleteCombo('combo1')
    expect(listCombos()).toHaveLength(0)
  })
})
