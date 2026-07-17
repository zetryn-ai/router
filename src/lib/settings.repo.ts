import { getDb } from './db'

export function getSetting(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run({ key, value })
}
