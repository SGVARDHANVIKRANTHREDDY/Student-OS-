import { getDb } from './db.js'
import { isPgConfigured, getReadPool } from './pg.js'
import { isRedisConfigured, getRedisConnection } from './redis.js'
import { logger } from './logger.js'

/**
 * In-process metrics counters.
 * For FAANG-scale, you'd push these to Prometheus / StatsD / OpenTelemetry.
 * This module provides the collection layer so metric export is a one-line change.
 */
const counters = new Map()
const histograms = new Map()

export function incrementCounter(name, labels = {}, value = 1) {
  const key = `${name}|${JSON.stringify(labels)}`
  counters.set(key, (counters.get(key) || 0) + value)
}

export function recordHistogram(name, value, labels = {}) {
  const key = `${name}|${JSON.stringify(labels)}`
  if (!histograms.has(key)) histograms.set(key, [])
  const arr = histograms.get(key)
  arr.push(value)
  // Keep bounded to prevent memory leak
  if (arr.length > 10000) arr.splice(0, arr.length - 5000)
}

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function computeHistogramStats(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  }
}

/**
 * Returns a snapshot of all collected metrics.
 */
export function getMetricsSnapshot() {
  const result = { counters: {}, histograms: {} }

  for (const [key, value] of counters) {
    result.counters[key] = value
  }

  for (const [key, values] of histograms) {
    result.histograms[key] = computeHistogramStats(values)
  }

  return result
}

/**
 * Dependency health check.  Returns { healthy: bool, checks: { ... } }
 */
export async function getDependencyHealth() {
  const checks = {}

  // SQLite
  try {
    const db = getDb()
    db.prepare('SELECT 1').get()
    checks.sqlite = { status: 'healthy' }
  } catch (err) {
    checks.sqlite = { status: 'unhealthy', error: err.message }
  }

  // PostgreSQL
  if (isPgConfigured()) {
    try {
      const pool = getReadPool()
      await pool.query('SELECT 1')
      checks.postgres = { status: 'healthy' }
    } catch (err) {
      checks.postgres = { status: 'unhealthy', error: err.message }
    }
  } else {
    checks.postgres = { status: 'not_configured' }
  }

  // Redis
  if (isRedisConfigured()) {
    try {
      const redis = getRedisConnection()
      await redis.ping()
      checks.redis = { status: 'healthy' }
    } catch (err) {
      checks.redis = { status: 'unhealthy', error: err.message }
    }
  } else {
    checks.redis = { status: 'not_configured' }
  }

  const healthy = Object.values(checks).every(
    (c) => c.status === 'healthy' || c.status === 'not_configured'
  )

  return { healthy, checks }
}
