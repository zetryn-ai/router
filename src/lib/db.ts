import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

let instance: Database.Database | null = null

export function getDb(): Database.Database {
  if (instance) return instance

  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
  fs.mkdirSync(dataDir, { recursive: true })

  const db = new Database(path.join(dataDir, 'router.db'))
  db.pragma('journal_mode = WAL')

  const migrationPath = path.join(process.cwd(), 'src', 'lib', 'migrations', '001_init.sql')
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8')
  db.exec(migrationSql)

  instance = db
  return instance
}
