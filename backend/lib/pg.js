import pg from 'pg'
import { logger } from './logger.js'

const { Pool } = pg

let writePool
let readPool

function getDbUrl(kind) {
  const envUrl = kind === 'read' ? process.env.PG_READ_URL : process.env.PG_URL
  if (envUrl) return envUrl

  const host = process.env.PGHOST
  if (!host) return ''

  // PG_URL should be the source of truth in production; this fallback exists for local/dev.

  const user = process.env.PGUSER || 'student'
  const password = process.env.PGPASSWORD || 'student'
  const database = process.env.PGDATABASE || 'student_system'
  const port = Number(process.env.PGPORT || 5432)

  // `pg` accepts a connectionString, but explicit params are easier to override.
  return { host, user, password, database, port }
}

function createPool(kind) {
  const cfg = getDbUrl(kind)
  if (!cfg) return null

  const max = Number(process.env.PGPOOL_MAX || 20)
  const idleTimeoutMillis = Number(process.env.PGPOOL_IDLE_MS || 30_000)
  const connectionTimeoutMillis = Number(process.env.PGPOOL_CONN_TIMEOUT_MS || 5_000)

  // Enable SSL by default in production.  Set PG_SSL=0 to opt out (e.g., in-VPC).
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
  const sslEnv = String(process.env.PG_SSL || '').toLowerCase()
  const sslOff = ['0', 'false', 'no', 'off'].includes(sslEnv)
  const sslOn = ['1', 'true', 'yes', 'on'].includes(sslEnv) || (isProd && !sslOff)
  const ssl = sslOn ? { rejectUnauthorized: true } : false

  const pool = new Pool(
    typeof cfg === 'string'
      ? { connectionString: cfg, max, idleTimeoutMillis, connectionTimeoutMillis, ssl }
      : { ...cfg, max, idleTimeoutMillis, connectionTimeoutMillis, ssl }
  )

  const statementTimeoutMs = Number(process.env.PG_STATEMENT_TIMEOUT_MS || 10_000)
  if (Number.isFinite(statementTimeoutMs) && statementTimeoutMs > 0) {
    pool.on('connect', (client) => {
      client.query(`SET statement_timeout TO ${Math.trunc(statementTimeoutMs)}`).catch(() => {})
    })
  }

  pool.on('error', (err) => {
    logger.error({ err, kind }, '[pg] pool error')
  })

  return pool
}

export function isPgConfigured() {
  const disabled = String(process.env.PG_DISABLED || '').toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(disabled)) return false

  return Boolean(process.env.PG_URL || process.env.PGHOST)
}

export function getWritePool() {
  if (!isPgConfigured()) return null
  if (!writePool) writePool = createPool('write')
  return writePool
}

export function getReadPool() {
  if (!isPgConfigured()) return null
  if (!readPool) readPool = createPool('read') || getWritePool()
  return readPool
}

export async function closePgPools() {
  const pools = [readPool, writePool].filter(Boolean)
  readPool = undefined
  writePool = undefined
  await Promise.allSettled(pools.map((p) => p.end()))
}
