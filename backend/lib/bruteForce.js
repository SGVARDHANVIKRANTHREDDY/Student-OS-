import { isRedisConfigured, getRedisConnection } from './redis.js'
import { logger } from './logger.js'

const DEFAULT_WINDOW_SEC = 600
const DEFAULT_MAX = 8
const DEFAULT_BLOCK_SEC = 900

/**
 * Redis-backed brute-force protection for login endpoints.
 * Replaces the in-memory Map with distributed state that works across instances.
 *
 * Keys:   bf:<ip>::<email>  →  { count, blockedUntil }
 * TTL:    WINDOW + BLOCK seconds (auto-cleanup)
 */
export function createBruteForceGuard({
  windowSec = DEFAULT_WINDOW_SEC,
  maxAttempts = DEFAULT_MAX,
  blockSec = DEFAULT_BLOCK_SEC,
} = {}) {
  function keyFor(ip, email) {
    return `bf:${ip}::${email}`
  }

  async function recordFailure(ip, email) {
    if (!isRedisConfigured()) return
    const redis = getRedisConnection()
    const key = keyFor(ip, email)

    try {
      const multi = redis.multi()
      multi.hincrby(key, 'count', 1)
      multi.expire(key, windowSec + blockSec)
      const results = await multi.exec()
      const count = results?.[0]?.[1] ?? 0

      if (count >= maxAttempts) {
        const blockedUntil = Date.now() + blockSec * 1000
        await redis.hset(key, 'blockedUntil', String(blockedUntil))
      }
    } catch (err) {
      logger.warn({ err, key }, '[brute-force] Redis record failure')
    }
  }

  async function clearAttempts(ip, email) {
    if (!isRedisConfigured()) return
    const redis = getRedisConnection()
    try {
      await redis.del(keyFor(ip, email))
    } catch (err) {
      logger.warn({ err }, '[brute-force] Redis clear failure')
    }
  }

  async function isBlocked(ip, email) {
    if (!isRedisConfigured()) return { blocked: false }
    const redis = getRedisConnection()
    try {
      const data = await redis.hgetall(keyFor(ip, email))
      if (!data || !data.blockedUntil) return { blocked: false }
      const until = Number(data.blockedUntil)
      const now = Date.now()
      if (until > now) {
        return { blocked: true, retryAfterSec: Math.ceil((until - now) / 1000) }
      }
      return { blocked: false }
    } catch (err) {
      logger.warn({ err }, '[brute-force] Redis check failure')
      return { blocked: false }
    }
  }

  return { recordFailure, clearAttempts, isBlocked }
}
