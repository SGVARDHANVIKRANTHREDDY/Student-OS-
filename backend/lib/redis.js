import { Redis } from 'ioredis'
import { logger } from './logger.js'

let connection

function buildRedisOptions() {
  // Prefer a single URL (prod-friendly).
  const url = process.env.REDIS_URL
  if (url) {
    return { url }
  }

  // Dev-friendly split envs.
  const host = process.env.REDIS_HOST || process.env.REDIS_HOSTNAME
  if (!host) return null

  const port = Number(process.env.REDIS_PORT || 6379)
  const password = process.env.REDIS_PASSWORD || undefined
  const db = process.env.REDIS_DB ? Number(process.env.REDIS_DB) : undefined

  return { host, port, password, db }
}

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL || process.env.REDIS_HOST || process.env.REDIS_HOSTNAME)
}

export function getRedisConnection() {
  if (connection) return connection

  const opts = buildRedisOptions()
  if (!opts) return null

  connection = new Redis({
    ...opts,
    // BullMQ/ioredis recommended settings for stability.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  })

  connection.on('error', (err) => {
    logger.error({ err }, '[redis] connection error')
  })

  connection.on('ready', () => {
    logger.info('[redis] ready')
  })

  return connection
}

export async function closeRedisConnection() {
  if (!connection) return
  const c = connection
  connection = undefined

  try {
    await c.quit()
  } catch (err) {
    logger.warn({ err }, '[redis] quit failed; forcing disconnect')
    try {
      c.disconnect()
    } catch {
      // ignore
    }
  }
}
