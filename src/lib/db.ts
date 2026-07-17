import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

let instance: Database.Database | null = null

function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  const migrationsDir = path.join(process.cwd(), 'src', 'lib', 'migrations')
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const isApplied = db.prepare('SELECT 1 FROM schema_migrations WHERE filename = ?')
  const markApplied = db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)')

  for (const file of files) {
    if (isApplied.get(file)) continue
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    db.transaction(() => {
      db.exec(sql)
      markApplied.run(file)
    })()
  }
}

export function getDb(): Database.Database {
  if (instance) return instance

  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
  fs.mkdirSync(dataDir, { recursive: true })

  const db = new Database(path.join(dataDir, 'router.db'))
  db.pragma('journal_mode = WAL')

  runMigrations(db)

  instance = db
  return instance
}
