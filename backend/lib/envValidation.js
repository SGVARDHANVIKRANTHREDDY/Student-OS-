/**
 * Validates required & optional environment variables at startup.
 * Fails fast in production if critical variables are missing.
 */
import { logger } from './logger.js'

const REQUIRED_PROD = [
  'JWT_SECRET',
  'CORS_ORIGIN',
]

const RECOMMENDED = [
  'REDIS_URL',
  'PG_URL',
  'GOOGLE_CLIENT_ID',
]

export function validateEnv() {
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
  const missing = []
  const warnings = []

  for (const key of REQUIRED_PROD) {
    if (!process.env[key]) {
      if (isProd) {
        missing.push(key)
      } else {
        warnings.push(`${key} not set (required in production)`)
      }
    }
  }

  for (const key of RECOMMENDED) {
    if (!process.env[key]) {
      warnings.push(`${key} not set (recommended for full functionality)`)
    }
  }

  if (warnings.length > 0) {
    logger.warn({ vars: warnings }, '[env] Missing recommended environment variables')
  }

  if (missing.length > 0) {
    logger.fatal({ vars: missing }, '[env] Missing required environment variables')
    process.exit(1)
  }
}
