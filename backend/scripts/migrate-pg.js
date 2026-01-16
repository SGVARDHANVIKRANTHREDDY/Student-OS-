import dotenv from 'dotenv'
import { getWritePool, isPgConfigured, closePgPools } from '../lib/pg.js'
import { runPgMigrations } from '../lib/pgMigrate.js'

dotenv.config()

async function main() {
  if (!isPgConfigured()) {
    console.error('[pg:migrate] Postgres not configured. Set PG_URL (or PGHOST/PGUSER/PGPASSWORD/PGDATABASE).')
    process.exit(1)
  }

  const pool = getWritePool()
  try {
    await runPgMigrations(pool)
    console.log('[pg:migrate] done')
  } finally {
    await closePgPools()
  }
}

main().catch((err) => {
  console.error('[pg:migrate] failed', err)
  process.exit(1)
})
