import crypto from 'node:crypto'
import { getDb } from './db'
import { hashPassword, verifyPassword } from './auth'

export type ApiKey = {
  id: number
  label: string
  keyPrefix: string
  createdAt: string
  lastUsedAt: string | null
}

type ApiKeyRow = {
  id: number
  label: string
  key_hash: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
}

function toApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    label: row.label,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

export function createApiKey(label: string): { record: ApiKey; plaintext: string } {
  const plaintext = 'zr_' + crypto.randomBytes(16).toString('hex')
  const keyHash = hashPassword(plaintext)
  const keyPrefix = plaintext.slice(0, 8)
  const result = getDb()
    .prepare('INSERT INTO api_keys (label, key_hash, key_prefix) VALUES (?, ?, ?)')
    .run(label, keyHash, keyPrefix)
  const row = getDb().prepare('SELECT * FROM api_keys WHERE id = ?').get(result.lastInsertRowid) as ApiKeyRow
  return { record: toApiKey(row), plaintext }
}

export function listApiKeys(): ApiKey[] {
  const rows = getDb().prepare('SELECT * FROM api_keys ORDER BY id DESC').all() as ApiKeyRow[]
  return rows.map(toApiKey)
}

export function deleteApiKey(id: number): void {
  getDb().prepare('DELETE FROM api_keys WHERE id = ?').run(id)
}

export function verifyApiKey(plaintext: string): boolean {
  const rows = getDb().prepare('SELECT * FROM api_keys').all() as ApiKeyRow[]
  for (const row of rows) {
    if (verifyPassword(plaintext, row.key_hash)) {
      getDb().prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(row.id)
      return true
    }
  }
  return false
}
