import { getDb } from './db'
import type { ComboStrategy } from './schemas'

export type Combo = {
  id: number
  name: string
  strategy: ComboStrategy
  models: string[]
  createdAt: string
}

type ComboRow = {
  id: number
  name: string
  strategy: ComboStrategy
  models_json: string
  created_at: string
}

function toCombo(row: ComboRow): Combo {
  return {
    id: row.id,
    name: row.name,
    strategy: row.strategy,
    models: JSON.parse(row.models_json),
    createdAt: row.created_at,
  }
}

export function listCombos(): Combo[] {
  const rows = getDb().prepare('SELECT * FROM combos ORDER BY name').all() as ComboRow[]
  return rows.map(toCombo)
}

export function getComboByName(name: string): Combo | undefined {
  const row = getDb().prepare('SELECT * FROM combos WHERE name = ?').get(name) as ComboRow | undefined
  return row ? toCombo(row) : undefined
}

export function createCombo(input: { name: string; strategy: ComboStrategy; models: string[] }): Combo {
  getDb()
    .prepare('INSERT INTO combos (name, strategy, models_json) VALUES (?, ?, ?)')
    .run(input.name, input.strategy, JSON.stringify(input.models))
  const created = getComboByName(input.name)
  if (!created) throw new Error(`failed to read back combo ${input.name}`)
  return created
}

export function updateCombo(name: string, patch: { strategy?: ComboStrategy; models?: string[] }): void {
  if (patch.strategy !== undefined) {
    getDb().prepare('UPDATE combos SET strategy = ? WHERE name = ?').run(patch.strategy, name)
  }
  if (patch.models !== undefined) {
    getDb().prepare('UPDATE combos SET models_json = ? WHERE name = ?').run(JSON.stringify(patch.models), name)
  }
}

export function deleteCombo(name: string): void {
  getDb().prepare('DELETE FROM combos WHERE name = ?').run(name)
}
