import { getRedisConnection, isRedisConfigured } from '../lib/redis.js'
import { logger } from '../lib/logger.js'

function getClientIp(req) {
  // Express with trust proxy may set req.ip.
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || ''
  return String(Array.isArray(ip) ? ip[0] : ip).split(',')[0].trim() || 'unknown'
}

export function redisRateLimit({ keyPrefix, windowSec, max, getIdentity }) {
  return async (req, res, next) => {
    if (!isRedisConfigured()) return next()

    const redis = getRedisConnection()
    if (!redis) return next()

    try {
      const identity = getIdentity ? getIdentity(req) : null
      const tenantPart = identity?.tenantId ? `t:${identity.tenantId}` : 't:none'
      const userPart = identity?.userId ? `u:${identity.userId}` : 'u:anon'
      const ipPart = identity?.ip ? `ip:${identity.ip}` : `ip:${getClientIp(req)}`

      const key = `${keyPrefix}:${tenantPart}:${userPart}:${ipPart}`

      const count = await redis.incr(key)
      if (count === 1) {
        await redis.expire(key, Number(windowSec))
      }

      if (count > max) {
        return res.status(429).json({
          message: identity?.message || 'Rate limit exceeded. Please try again later.',
          retryAfterSec: Number(windowSec),
        })
      }

      return next()
    } catch (err) {
      // Fail-open (platform safety > availability tradeoff). Log for ops.
      logger.warn({ err }, '[rateLimit] redisRateLimit failed; allowing request')
      return next()
    }
  }
}
