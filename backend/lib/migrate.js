import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
}

function listMigrationFiles() {
  const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const migrationsDir = path.join(baseDir, 'migrations')
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))

  return files.map((f) => ({ id: f, fullPath: path.join(migrationsDir, f) }))
}

export function runMigrations(db, { logger = console } = {}) {
  ensureMigrationsTable(db)

  const applied = new Set(
    db
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((r) => r.id)
  )

  const migrations = listMigrationFiles()

  for (const m of migrations) {
    if (applied.has(m.id)) continue

    const sql = fs.readFileSync(m.fullPath, 'utf8')
    const now = new Date().toISOString()

    logger.info?.(`[db:migrate] applying ${m.id}`)

    try {
      db.exec('BEGIN')
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(m.id, now)
      db.exec('COMMIT')
    } catch (err) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // ignore
      }
      logger.error?.('[db:migrate] failed', { migration: m.id, err })
      throw err
    }
  }
}
