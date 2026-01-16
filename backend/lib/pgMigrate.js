import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

function listMigrationFiles() {
  const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const migrationsDir = path.join(baseDir, 'pg-migrations')
  if (!fs.existsSync(migrationsDir)) return []

  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => ({ id: f, fullPath: path.join(migrationsDir, f) }))
}

export async function runPgMigrations(pool, { logger = console } = {}) {
  if (!pool) throw new Error('Postgres pool not configured')

  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL
      );
    `)

    const appliedRes = await client.query('SELECT id FROM schema_migrations')
    const applied = new Set(appliedRes.rows.map((r) => r.id))

    const migrations = listMigrationFiles()
    for (const m of migrations) {
      if (applied.has(m.id)) continue

      const sql = fs.readFileSync(m.fullPath, 'utf8')
      logger.info?.(`[pg:migrate] applying ${m.id}`)

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, NOW())', [m.id])
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        logger.error?.('[pg:migrate] failed', { migration: m.id, err })
        throw err
      }
    }
  } finally {
    client.release()
  }
}
