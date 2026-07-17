import { getDb } from './db'

export function logRequest(entry: {
  credentialId: number | null
  providerSlug: string
  statusCode: number | null
  durationMs: number
}): void {
  getDb()
    .prepare(
      `INSERT INTO request_logs (credential_id, provider_slug, status_code, duration_ms)
       VALUES (@credentialId, @providerSlug, @statusCode, @durationMs)`
    )
    .run(entry)
}

type LogRow = {
  id: number
  credential_id: number | null
  provider_slug: string
  status_code: number | null
  duration_ms: number | null
  created_at: string
}

export type LogEntry = {
  id: number
  credentialId: number | null
  providerSlug: string
  statusCode: number | null
  durationMs: number | null
  createdAt: string
}

export function listLogs(filters: {
  providerSlug?: string
  statusCode?: number
  limit?: number
  offset?: number
}): LogEntry[] {
  const conditions: string[] = []
  const params: Record<string, unknown> = {}
  if (filters.providerSlug) {
    conditions.push('provider_slug = @providerSlug')
    params.providerSlug = filters.providerSlug
  }
  if (filters.statusCode !== undefined) {
    conditions.push('status_code = @statusCode')
    params.statusCode = filters.statusCode
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.limit = filters.limit ?? 100
  params.offset = filters.offset ?? 0

  const rows = getDb()
    .prepare(
      `SELECT * FROM request_logs ${where} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`
    )
    .all(params) as LogRow[]

  return rows.map((row) => ({
    id: row.id,
    credentialId: row.credential_id,
    providerSlug: row.provider_slug,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  }))
}

export function pruneLogsOlderThan(days: number): void {
  getDb()
    .prepare(`DELETE FROM request_logs WHERE created_at < datetime('now', '-' || ? || ' days')`)
    .run(days)
}
