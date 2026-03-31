/**
 * Lightweight Express app for integration tests.
 * Sets up the same middleware + routes as server.js but doesn't listen or
 * connect to PG/Redis (so tests run without external deps).
 */
import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import hpp from 'hpp'
import { correlationId } from '../lib/correlationId.js'
import { requestTiming } from '../lib/requestTiming.js'
import { getDb } from '../lib/db.js'
import authMiddleware from '../middleware/auth.js'
import authRoutes from '../routes/auth.js'
import profileRoutes from '../routes/profile.js'
import jobsRoutes from '../routes/jobs.js'
import { getDependencyHealth, getMetricsSnapshot } from '../lib/metrics.js'

// Ensure DB is initialized
const db = getDb()

const app = express()

app.use(correlationId())
app.use(requestTiming())
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use(hpp())
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())

// Health endpoints
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, data: { status: 'ok' } })
})

app.get('/api/ready', async (_req, res) => {
  const { healthy, checks } = await getDependencyHealth()
  res.status(healthy ? 200 : 503).json({ ok: healthy, data: { status: healthy ? 'ready' : 'not_ready', checks } })
})

app.get('/api/metrics', (_req, res) => {
  res.json({ ok: true, data: getMetricsSnapshot() })
})

// Route modules
app.use('/api/auth', authRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/jobs', jobsRoutes)

// Error handler
app.use((err, _req, res, _next) => {
  if (res.headersSent) return
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON' })
  res.status(500).json({ message: 'Internal server error' })
})

export { app, db }
