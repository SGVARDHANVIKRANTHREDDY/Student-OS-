import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import crypto from 'crypto'
import rateLimit from 'express-rate-limit'
import authMiddleware from '../middleware/auth.js'
import { getDb } from '../lib/db.js'
import { effectiveTenantId } from '../lib/tenancy.js'
import { ensureDefaultRoleAssignments, ensureTenantMembership, getAuthzSnapshot, getTenantIdForUser } from '../lib/rbac.js'
import { validate } from '../lib/validate.js'
import { loginBody, signupBody, googleAuthBody } from '../lib/schemas.js'
import { apiSuccess, apiCreated, apiError, apiUnauthorized, apiForbidden, apiTooMany, apiConflict } from '../lib/apiResponse.js'
import { createBruteForceGuard } from '../lib/bruteForce.js'

const router = express.Router()

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function signToken(user, { tenantId, roles = [], permissions = [] } = {}) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      tenantId: effectiveTenantId(tenantId),
      roles,
      permissions,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' }
  )
}

function buildAuthSnapshot(db, user) {
  const tenantId = getTenantIdForUser(db, user.id) || null
  const ensuredTenantId = ensureTenantMembership(db, user.id, tenantId)
  ensureDefaultRoleAssignments(db, { userId: user.id, tenantId: ensuredTenantId, legacyRole: user.role })
  return getAuthzSnapshot(db, { userId: user.id, tenantId: ensuredTenantId })
}

function isAdminSnapshot(snap) {
  const roles = Array.isArray(snap?.roles) ? snap.roles : []
  return roles.some((r) => ['PLATFORM_ADMIN', 'CONTENT_ADMIN', 'JOB_ADMIN', 'ACADEMIC_ADMIN'].includes(String(r)))
}

function sha256Base64Url(input) {
  return crypto.createHash('sha256').update(input).digest('base64url')
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req.ip ||
    req.connection?.remoteAddress ||
    ''
  )
}

function buildRefreshCookieOptions() {
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30d
  }
}

function setRefreshCookie(res, token) {
  res.cookie('refresh_token', token, buildRefreshCookieOptions())
}

function clearRefreshCookie(res) {
  res.clearCookie('refresh_token', { ...buildRefreshCookieOptions(), maxAge: 0 })
}

function issueRefreshToken(db, userId, { userAgent = '', ip = '' } = {}) {
  const raw = crypto.randomBytes(48).toString('base64url')
  const tokenHash = sha256Base64Url(raw)
  const now = new Date().toISOString()
  const ttlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30)
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()

  const row = {
    id: crypto.randomUUID(),
    user_id: userId,
    token_hash: tokenHash,
    created_at: now,
    expires_at: expiresAt,
    revoked_at: null,
    rotated_from: null,
    last_used_at: null,
    user_agent: String(userAgent || '').slice(0, 512),
    ip: String(ip || '').slice(0, 128),
  }

  db.prepare(
    `INSERT INTO refresh_tokens (
      id, user_id, token_hash, created_at, expires_at, revoked_at,
      rotated_from, last_used_at, user_agent, ip
    ) VALUES (
      @id, @user_id, @token_hash, @created_at, @expires_at, @revoked_at,
      @rotated_from, @last_used_at, @user_agent, @ip
    )`
  ).run(row)

  return { raw, id: row.id, expiresAt }
}

function rotateRefreshToken(db, currentTokenRow, { userAgent = '', ip = '' } = {}) {
  const now = new Date().toISOString()
  db.prepare(`UPDATE refresh_tokens SET revoked_at = ?, last_used_at = ? WHERE id = ?`).run(
    now,
    now,
    currentTokenRow.id
  )

  const next = issueRefreshToken(db, currentTokenRow.user_id, { userAgent, ip })
  db.prepare(`UPDATE refresh_tokens SET rotated_from = ? WHERE id = ?`).run(currentTokenRow.id, next.id)
  return next
}

// Distributed brute-force protection via Redis (falls back gracefully if Redis is unavailable).
const bruteForce = createBruteForceGuard({
  windowSec: Number(process.env.LOGIN_WINDOW_MS || 600000) / 1000,
  maxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 8),
  blockSec: Number(process.env.LOGIN_BLOCK_MS || 900000) / 1000,
})

async function recordFailedAttempt(req, email) {
  await bruteForce.recordFailure(getClientIp(req), normalizeEmail(email))
}

async function clearAttempts(req, email) {
  await bruteForce.clearAttempts(getClientIp(req), normalizeEmail(email))
}

async function isBlocked(req, email) {
  return bruteForce.isBlocked(getClientIp(req), normalizeEmail(email))
}

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

router.use(authLimiter)

function normalizeProfile(row) {
  if (!row) return null
  return {
    userId: row.user_id,
    college: row.college,
    branch: row.branch,
    graduationYear: row.graduation_year,
    careerGoal: row.career_goal,
    onboarded: !!row.onboarded,
    updatedAt: row.updated_at,
  }
}

function ensureProfile(db, userId) {
  const now = new Date().toISOString()
  db.prepare(`INSERT OR IGNORE INTO profiles (user_id, updated_at) VALUES (?, ?)`).run(userId, now)
  return db.prepare(`SELECT * FROM profiles WHERE user_id = ?`).get(userId)
}

async function handleLocalLogin(req, res, { requireAdmin = false } = {}) {
  const db = getDb()
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')

  if (!email || !password) {
    return apiError(res, { status: 400, code: 'VALIDATION_ERROR', message: 'Email and password are required' })
  }

  const blocked = await isBlocked(req, email)
  if (blocked.blocked) {
    return apiTooMany(res, { retryAfterSec: blocked.retryAfterSec, message: 'Too many failed sign-in attempts. Please try again later.' })
  }

  const user = db.prepare(`SELECT id, email, name, password_hash, role, status FROM users WHERE email = ?`).get(email)
  if (!user?.password_hash || user.status === 'DELETED') {
    await recordFailedAttempt(req, email)
    return apiUnauthorized(res, 'Invalid email or password')
  }

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) {
    await recordFailedAttempt(req, email)
    return apiUnauthorized(res, 'Invalid email or password')
  }

  await clearAttempts(req, email)

  const snap = buildAuthSnapshot(db, user)
  if (requireAdmin && !isAdminSnapshot(snap)) {
    return apiForbidden(res, 'Admin access required')
  }

  const profile = ensureProfile(db, user.id)

  const refresh = issueRefreshToken(db, user.id, {
    userAgent: req.headers['user-agent'],
    ip: getClientIp(req),
  })
  setRefreshCookie(res, refresh.raw)

  return apiSuccess(res, {
    token: signToken(user, snap),
    refreshToken: refresh.raw,
    user: { id: user.id, email: user.email, name: user.name, role: user.role || 'user' },
    profile: normalizeProfile(profile),
    auth: snap,
  })
}

router.post('/signup', validate({ body: signupBody }), async (req, res) => {
  const db = getDb()
  const { name, email, password } = req.body

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email)
  if (existing) return apiConflict(res, 'An account already exists for this email')

  const passwordHash = await bcrypt.hash(password, 12)
  const now = new Date().toISOString()
  const user = {
    id: crypto.randomUUID(),
    email,
    name,
    password_hash: passwordHash,
    provider: 'local',
    google_sub: null,
    role: 'user',
    created_at: now,
    updated_at: now,
  }

  db.prepare(
     `INSERT INTO users (id, email, name, password_hash, provider, google_sub, role, created_at, updated_at)
      VALUES (@id, @email, @name, @password_hash, @provider, @google_sub, @role, @created_at, @updated_at)`
  ).run(user)

  const profile = ensureProfile(db, user.id)

  const snap = buildAuthSnapshot(db, user)

  const refresh = issueRefreshToken(db, user.id, {
    userAgent: req.headers['user-agent'],
    ip: getClientIp(req),
  })
  setRefreshCookie(res, refresh.raw)

  return apiCreated(res, {
    token: signToken(user, snap),
    refreshToken: refresh.raw,
    user: { id: user.id, email: user.email, name: user.name, role: user.role || 'user' },
    profile: normalizeProfile(profile),
    auth: snap,
  })
})

router.post('/login', validate({ body: loginBody }), async (req, res) => {
  return handleLocalLogin(req, res, { requireAdmin: false })
})

// Student portal login (explicit; same behavior as /login).
router.post('/login/student', validate({ body: loginBody }), async (req, res) => {
  return handleLocalLogin(req, res, { requireAdmin: false })
})

// Admin portal login (role-gated).
router.post('/login/admin', validate({ body: loginBody }), async (req, res) => {
  return handleLocalLogin(req, res, { requireAdmin: true })
})

router.get('/me', authMiddleware, (req, res) => {
  const db = getDb()
  const user = db.prepare(`SELECT id, email, name, role FROM users WHERE id = ?`).get(req.user.id)
  if (!user) return apiUnauthorized(res, 'Invalid session')

  const profile = ensureProfile(db, user.id)

  const snap = buildAuthSnapshot(db, user)
  return apiSuccess(res, { user, profile: normalizeProfile(profile), auth: snap })
})

router.post('/google', validate({ body: googleAuthBody }), async (req, res) => {
  const { credential } = req.body

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return apiError(res, { status: 500, code: 'CONFIG_ERROR', message: 'Google sign-in is not configured' })

  const client = new OAuth2Client(clientId)
  let payload
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId })
    payload = ticket.getPayload()
  } catch {
    return apiUnauthorized(res, 'Google authentication failed')
  }

  const email = normalizeEmail(payload?.email)
  const googleSub = String(payload?.sub || '')
  const name = String(payload?.name || '').trim() || 'Student'
  if (!email || !isValidEmail(email) || !googleSub) {
    return apiError(res, { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid Google account' })
  }

  const db = getDb()
  const now = new Date().toISOString()

  let user = db.prepare(`SELECT id, email, name, role, status FROM users WHERE google_sub = ?`).get(googleSub)
  if (user?.status === 'DELETED') {
    return apiForbidden(res, 'This account has been deleted')
  }
  if (!user) {
    const byEmail = db.prepare(`SELECT id, email, name, google_sub, role, status FROM users WHERE email = ?`).get(email)
    if (byEmail) {
      if (byEmail.status === 'DELETED') {
        return apiForbidden(res, 'This account has been deleted')
      }
      if (!byEmail.google_sub) {
        db.prepare(`UPDATE users SET google_sub = ?, updated_at = ? WHERE id = ?`).run(googleSub, now, byEmail.id)
      }
      user = { id: byEmail.id, email: byEmail.email, name: byEmail.name, role: byEmail.role || 'user' }
    }
  }

  if (!user) {
    const newUser = {
      id: crypto.randomUUID(),
      email,
      name,
      password_hash: null,
      provider: 'google',
      google_sub: googleSub,
      role: 'user',
      created_at: now,
      updated_at: now,
    }

    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, provider, google_sub, role, created_at, updated_at)
       VALUES (@id, @email, @name, @password_hash, @provider, @google_sub, @role, @created_at, @updated_at)`
    ).run(newUser)

    user = { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role }
  }

  const profile = ensureProfile(db, user.id)

  const snap = buildAuthSnapshot(db, user)

  const refresh = issueRefreshToken(db, user.id, {
    userAgent: req.headers['user-agent'],
    ip: getClientIp(req),
  })
  setRefreshCookie(res, refresh.raw)
  return apiSuccess(res, {
    token: signToken(user, snap),
    refreshToken: refresh.raw,
    user: { id: user.id, email: user.email, name: user.name, role: user.role || 'user' },
    profile: normalizeProfile(profile),
    auth: snap,
  })
})

router.post('/refresh', async (req, res) => {
  const db = getDb()
  const raw = String(req.cookies?.refresh_token || req.body?.refreshToken || '')
  if (!raw) return apiUnauthorized(res, 'Missing refresh token')

  const tokenHash = sha256Base64Url(raw)
  const row = db
    .prepare(
      `SELECT id, user_id, expires_at, revoked_at
       FROM refresh_tokens
       WHERE token_hash = ?`
    )
    .get(tokenHash)

  if (!row) {
    clearRefreshCookie(res)
    return apiUnauthorized(res, 'Invalid refresh token')
  }

  // Token reuse detection: a revoked token being presented indicates possible theft.
  // Revoke ALL tokens for this user as a precaution.
  if (row.revoked_at) {
    db.prepare(`UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ?`)
      .run(new Date().toISOString(), row.user_id)
    clearRefreshCookie(res)
    return apiUnauthorized(res, 'Invalid refresh token')
  }

  const nowIso = new Date().toISOString()
  if (row.expires_at <= nowIso) {
    db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?`).run(nowIso, row.id)
    clearRefreshCookie(res)
    return apiUnauthorized(res, 'Expired refresh token')
  }

  const user = db.prepare(`SELECT id, email, name, role, status FROM users WHERE id = ?`).get(row.user_id)
  if (!user || user.status === 'DELETED') {
    clearRefreshCookie(res)
    return apiUnauthorized(res, 'Invalid session')
  }

  const next = rotateRefreshToken(db, row, {
    userAgent: req.headers['user-agent'],
    ip: getClientIp(req),
  })
  setRefreshCookie(res, next.raw)

  const snap = buildAuthSnapshot(db, user)
  return apiSuccess(res, { token: signToken(user, snap) })
})

router.post('/logout', authMiddleware, (req, res) => {
  const db = getDb()
  const raw = String(req.cookies?.refresh_token || req.body?.refreshToken || '')
  if (raw) {
    const tokenHash = sha256Base64Url(raw)
    const now = new Date().toISOString()
    db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?`).run(now, tokenHash)
  }
  clearRefreshCookie(res)
  return apiSuccess(res, { ok: true })
})

router.post('/logout/all', authMiddleware, (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const now = new Date().toISOString()
  db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(now, userId)
  clearRefreshCookie(res)
  return apiSuccess(res, { ok: true })
})

export default router
