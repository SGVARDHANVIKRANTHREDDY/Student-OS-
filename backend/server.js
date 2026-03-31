import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import hpp from 'hpp'
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/auth.js'
import academicsRoutes from './routes/academics.js'
import tasksRoutes from './routes/tasks.js'
import resumeRoutes from './routes/resume.js'
import matchingRoutes from './routes/matching.js'
import skillsRoutes from './routes/skills.js'
import learningRoutes from './routes/learning.js'
import roadmapsRoutes from './routes/roadmaps.js'
import profileRoutes from './routes/profile.js'
import jobsRoutes from './routes/jobs.js'
import applicationsRoutes from './routes/applications.js'
import adminRoutes from './routes/admin.js'
import postingsRoutes from './routes/postings.js'
import activityRoutes from './routes/activity.js'
import notificationsRoutes from './routes/notifications.js'
import accountRoutes from './routes/account.js'
import authMiddleware from './middleware/auth.js'
import { httpLogger, logger } from './lib/logger.js'
import { closeDb, getDb } from './lib/db.js'
import { closePgPools, getReadPool, getWritePool, isPgConfigured } from './lib/pg.js'
import { runPgMigrations } from './lib/pgMigrate.js'
import { closeQueues } from './lib/queues.js'
import { closeRedisConnection, getRedisConnection, isRedisConfigured } from './lib/redis.js'
import { correlationId } from './lib/correlationId.js'
import { requestTiming } from './lib/requestTiming.js'
import { validateEnv } from './lib/envValidation.js'
import { getDependencyHealth, getMetricsSnapshot, incrementCounter } from './lib/metrics.js'

dotenv.config()
validateEnv()

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV && process.env.NODE_ENV.toLowerCase() === 'production') {
    throw new Error('Missing JWT_SECRET. Set JWT_SECRET in the environment.')
  }

  // Generate a random ephemeral secret for development.  Tokens will not survive
  // server restarts, but the secret is never a guessable constant.
  const { randomBytes } = await import('node:crypto')
  process.env.JWT_SECRET = randomBytes(48).toString('base64url')
  console.warn('[auth] JWT_SECRET not set. Generated a random ephemeral secret for dev; tokens will expire on restart.')
}

const app = express()
const PORT = process.env.PORT || 5000

// Eagerly initialize DBs/migrations so the process fails fast on schema issues.
try {
  getDb()
} catch (err) {
  logger.fatal({ err }, '[startup] sqlite migrations failed')
  process.exit(1)
}

async function ensurePgMigrated() {
  if (!isPgConfigured()) return
  const pool = getWritePool()
  if (!pool) return
  await runPgMigrations(pool, { logger })
}

await (async () => {
  try {
    await ensurePgMigrated()
  } catch (err) {
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
    const strict = ['1', 'true', 'yes', 'y', 'on'].includes(String(process.env.PG_MIGRATIONS_STRICT || '').toLowerCase())
    if (isProd || strict) {
      logger.fatal({ err }, '[startup] pg migrations failed')
      process.exit(1)
    }

    logger.warn({ err }, '[startup] pg migrations failed; continuing without Postgres')
    process.env.PG_DISABLED = '1'
    try {
      await closePgPools()
    } catch {
      // ignore
    }
  }
})()

const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '1mb'

if (process.env.TRUST_PROXY) {
  const trustProxy = Number(process.env.TRUST_PROXY)
  if (!Number.isNaN(trustProxy)) app.set('trust proxy', trustProxy)
}

// ── Core middleware pipeline (order matters) ────────────────────
app.use(correlationId())
app.use(requestTiming())
app.use(httpLogger)

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}))
app.use(hpp())

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : null

if (allowedOrigins && allowedOrigins.length > 0) {
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  )
} else {
  if (process.env.NODE_ENV && process.env.NODE_ENV.toLowerCase() === 'production') {
    console.warn('[cors] CORS_ORIGIN not set. CORS is disabled (recommended for same-origin deployments).')
  }
}
app.use(express.json({ limit: jsonBodyLimit }))
app.use(express.urlencoded({ extended: false, limit: jsonBodyLimit }))
app.use(cookieParser())

// Request metrics collection
app.use((req, res, next) => {
  res.on('finish', () => {
    incrementCounter('http_requests_total', { method: req.method, status: res.statusCode })
  })
  next()
})

// Baseline API-level rate limiting. (Stricter limits are applied on auth endpoints.)
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  })
)

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/academics', academicsRoutes)
app.use('/api/tasks', tasksRoutes)
app.use('/api/resume', resumeRoutes)
app.use('/api/matching', matchingRoutes)
app.use('/api/skills', skillsRoutes)
app.use('/api/learning', learningRoutes)
app.use('/api/roadmaps', roadmapsRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/jobs', jobsRoutes)
app.use('/api/applications', applicationsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/postings', postingsRoutes)
app.use('/api/activity', activityRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/account', accountRoutes)

// ── Observability Endpoints ──────────────────────────────────────

app.get('/api/health', (req, res) => {
  return res.json({
    ok: true,
    data: {
      status: 'ok',
      version: process.env.APP_VERSION || '1.0.0',
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  })
})

app.get('/api/ready', async (req, res) => {
  const { healthy, checks } = await getDependencyHealth()
  const status = healthy ? 200 : 503
  return res.status(status).json({
    ok: healthy,
    data: { status: healthy ? 'ready' : 'not_ready', checks, timestamp: new Date().toISOString() },
  })
})

app.get('/api/metrics', (req, res) => {
  return res.json({ ok: true, data: getMetricsSnapshot() })
})

// Protected route example
app.get('/api/protected', authMiddleware, (req, res) => {
  res.json({ message: 'This is a protected route', user: req.user })
})

const HOST = process.env.HOST || '127.0.0.1'

const effectiveHost = process.env.HOST
  ? process.env.HOST
  : process.env.NODE_ENV && process.env.NODE_ENV.toLowerCase() === 'production'
    ? '0.0.0.0'
    : '127.0.0.1'

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)

  // Known domain-level errors (ServiceError) — safe to surface.
  if (err?.name === 'ServiceError' && err?.httpStatus) {
    logger.warn({ err, code: err.code }, '[service-error]')
    return res.status(err.httpStatus).json(err.toResponseBody())
  }

  // JSON parse errors (malformed body).
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: { code: 'PARSE_ERROR', message: 'Malformed JSON in request body' } })
  }

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } })
  }

  // Postgres statement timeout (query cancelled)
  if (err?.code === '57014' || String(err?.message || '').toLowerCase().includes('statement timeout')) {
    logger.warn({ err }, '[pg-timeout]')
    return res.status(503).json({ ok: false, error: { code: 'TIMEOUT', message: 'Query timed out. Please retry.' } })
  }

  // Unexpected errors — log at error level, return generic message.
  logger.error({ err, method: req.method, url: req.originalUrl }, '[unhandled-error]')
  return res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
})

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, '[unhandledRejection]')
})

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '[uncaughtException]')
})

const server = app.listen(PORT, effectiveHost, () => {
  logger.info(`Server running on http://${effectiveHost}:${PORT}`)
})

// Platform safeguards: time out hung connections.
try {
  const requestTimeoutMs = Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 30_000)
  if (Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0) {
    server.requestTimeout = Math.trunc(requestTimeoutMs)
    server.headersTimeout = Math.trunc(requestTimeoutMs) + 5_000
  }
} catch {
  // ignore
}

let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.warn({ signal }, '[shutdown] starting')

  const forceTimeout = setTimeout(() => {
    logger.fatal('[shutdown] forced exit after timeout')
    process.exit(1)
  }, 10_000)
  forceTimeout.unref?.()

  server.close(async () => {
    try {
      closeDb()
    } catch (err) {
      logger.error({ err }, '[shutdown] db close failed')
    }

    try {
      await closePgPools()
    } catch (err) {
      logger.error({ err }, '[shutdown] pg pool close failed')
    }

    try {
      await closeQueues()
    } catch (err) {
      logger.error({ err }, '[shutdown] queues close failed')
    }

    try {
      await closeRedisConnection()
    } catch (err) {
      logger.error({ err }, '[shutdown] redis close failed')
    }

    clearTimeout(forceTimeout)
    logger.info('[shutdown] complete')
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
