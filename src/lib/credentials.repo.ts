import { getDb } from './db'
import { encryptSecret, decryptSecret } from './crypto'
import type { NewCredentialInput } from './schemas'

export type Credential = {
  id: number
  providerId: number
  label: string
  baseUrlOverride: string | null
  secretValue: string
  injectLocationOverride: 'query' | 'header' | 'path' | null
  injectKeyNameOverride: string | null
  status: 'active' | 'cooldown' | 'disabled' | 'error'
  cooldownUntil: string | null
  lastUsedAt: string | null
  lastError: string | null
  priority: number
  createdAt: string
}

type CredentialRow = {
  id: number
  provider_id: number
  label: string
  base_url_override: string | null
  secret_value: string
  inject_location_override: 'query' | 'header' | 'path' | null
  inject_key_name_override: string | null
  status: 'active' | 'cooldown' | 'disabled' | 'error'
  cooldown_until: string | null
  last_used_at: string | null
  last_error: string | null
  priority: number
  created_at: string
}

function toCredential(row: CredentialRow): Credential {
  return {
    id: row.id,
    providerId: row.provider_id,
    label: row.label,
    baseUrlOverride: row.base_url_override,
    secretValue: decryptSecret(row.secret_value),
    injectLocationOverride: row.inject_location_override,
    injectKeyNameOverride: row.inject_key_name_override,
    status: row.status,
    cooldownUntil: row.cooldown_until,
    lastUsedAt: row.last_used_at,
    lastError: row.last_error,
    priority: row.priority,
    createdAt: row.created_at,
  }
}

export function listCredentialsByProvider(providerId: number): Credential[] {
  const rows = getDb()
    .prepare('SELECT * FROM credentials WHERE provider_id = ? ORDER BY id')
    .all(providerId) as CredentialRow[]
  return rows.map(toCredential)
}

export function createCredential(input: NewCredentialInput): Credential {
  const result = getDb()
    .prepare(
      `INSERT INTO credentials (provider_id, label, base_url_override, secret_value, inject_location_override, inject_key_name_override, priority)
       VALUES (@providerId, @label, @baseUrlOverride, @secretValue, @injectLocationOverride, @injectKeyNameOverride, @priority)`
    )
    .run({
      providerId: input.providerId,
      label: input.label,
      baseUrlOverride: input.baseUrlOverride ?? null,
      secretValue: encryptSecret(input.secretValue),
      injectLocationOverride: input.injectLocationOverride ?? null,
      injectKeyNameOverride: input.injectKeyNameOverride ?? null,
      priority: input.priority ?? 100,
    })
  const row = getDb()
    .prepare('SELECT * FROM credentials WHERE id = ?')
    .get(result.lastInsertRowid) as CredentialRow
  return toCredential(row)
}

export function markActive(id: number): void {
  getDb().prepare("UPDATE credentials SET status = 'active', cooldown_until = NULL WHERE id = ?").run(id)
}

export function markCooldown(id: number, cooldownSeconds: number): void {
  getDb()
    .prepare(
      `UPDATE credentials SET status = 'cooldown', cooldown_until = datetime('now', '+' || ? || ' seconds') WHERE id = ?`
    )
    .run(cooldownSeconds, id)
}

export function markError(id: number, message: string): void {
  getDb()
    .prepare("UPDATE credentials SET status = 'error', last_error = ?, cooldown_until = NULL WHERE id = ?")
    .run(message, id)
}

export function markDisabled(id: number): void {
  getDb().prepare("UPDATE credentials SET status = 'disabled' WHERE id = ?").run(id)
}

export function touchLastUsed(id: number): void {
  getDb().prepare("UPDATE credentials SET last_used_at = datetime('now') WHERE id = ?").run(id)
}

export function reactivateExpiredCooldowns(providerId: number): void {
  getDb()
    .prepare(
      `UPDATE credentials
       SET status = 'active', cooldown_until = NULL
       WHERE provider_id = ? AND status = 'cooldown' AND cooldown_until <= datetime('now')`
    )
    .run(providerId)
}

export function deleteCredential(id: number): void {
  getDb().prepare('DELETE FROM credentials WHERE id = ?').run(id)
}
