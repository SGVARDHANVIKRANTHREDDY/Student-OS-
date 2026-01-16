import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getDb } from '../lib/db.js'
import { isQueueingAvailable, getQueues } from '../lib/queues.js'
import { getLatestResumeVersion } from '../lib/resumeDomain.js'
import { resumeMatchingJobName, makeResumeMatchingPayload } from '../lib/jobPayloads.js'
import { logger } from '../lib/logger.js'
import { isPgConfigured } from '../lib/pg.js'
import { writeAuditLog } from '../lib/auditDal.js'
import { emitActivityEvent } from '../lib/activityDal.js'
import { ACTIVITY_EVENT_TYPES, JOB_TYPES } from '../lib/activityTypes.js'
import { recordJobQueued } from '../lib/jobStatusDal.js'
import { QUEUE_NAMES } from '../lib/queues.js'
import { getTenantIdFromRequest } from '../lib/tenancy.js'
import { hasPermission } from '../lib/rbac.js'
import { requireUserInTenant } from '../lib/tenantScope.js'

function canReadUserParam(req, requestedUserId) {
  if (String(req.user?.id || '') === String(requestedUserId || '')) return true
  return hasPermission(req.auth, 'platform:admin') || hasPermission(req.auth, 'users:read:any')
}

function canWriteUserParam(req, requestedUserId) {
  if (String(req.user?.id || '') === String(requestedUserId || '')) return true
  return hasPermission(req.auth, 'platform:admin')
}

const router = express.Router()

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

router.get('/me', authMiddleware, (req, res) => {
  const db = getDb()
  const row = ensureProfile(db, req.user.id)
  return res.json({ profile: normalizeProfile(row) })
})

router.post('/me', authMiddleware, (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const { college, branch, graduationYear, careerGoal, onboarded } = req.body || {}

  if (careerGoal !== undefined && !String(careerGoal).trim()) {
    return res.status(400).json({ message: 'Career goal is required' })
  }

  ensureProfile(db, userId)
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE profiles SET
      college = COALESCE(?, college),
      branch = COALESCE(?, branch),
      graduation_year = COALESCE(?, graduation_year),
      career_goal = COALESCE(?, career_goal),
      onboarded = COALESCE(?, onboarded),
      updated_at = ?
     WHERE user_id = ?`
  ).run(
    college ?? null,
    branch ?? null,
    graduationYear ?? null,
    careerGoal ?? null,
    typeof onboarded === 'boolean' ? (onboarded ? 1 : 0) : null,
    now,
    userId
  )

  const row = db.prepare(`SELECT * FROM profiles WHERE user_id = ?`).get(userId)
  return res.json({ profile: normalizeProfile(row) })
})

// Module 3: Persist a target job (by job_id) and trigger async matching.
router.post('/me/target-job', authMiddleware, async (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const tenantId = getTenantIdFromRequest(req)
  const jobId = String(req.body?.jobId || '').trim()

  if (!jobId) return res.status(400).json({ message: 'jobId is required' })

  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO resume_targets (user_id, tenant_id, job_id, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(user_id, tenant_id, job_id)
     DO UPDATE SET is_active = 1, updated_at = excluded.updated_at`
    ).run(userId, tenantId ? String(tenantId) : null, jobId, now, now)

  try {
    writeAuditLog({
      tenantId,
      actorType: 'USER',
      actorUserId: userId,
      action: 'TARGET_JOB_CHANGE',
      targetType: 'job',
      targetId: jobId,
      metadata: {},
      correlationId: req.id || null,
      db,
    })
  } catch {
    // ignore
  }

  try {
    emitActivityEvent({
      tenantId,
      userId,
      type: ACTIVITY_EVENT_TYPES.TARGET_JOB_CHANGED,
      source: 'API',
      status: 'SUCCESS',
      relatedEntityType: 'job',
      relatedEntityId: jobId,
      correlationId: req.id || null,
      metadata: {},
      notify: false,
      db,
    })
  } catch {
    // ignore
  }

  try {
    if (isQueueingAvailable() && isPgConfigured()) {
      const latest = getLatestResumeVersion(db, userId)
      if (latest?.version_label) {
        const queues = getQueues()
        const payload = makeResumeMatchingPayload({
          userId,
          tenantId,
          resumeVersion: latest.version_label,
          resumeVersionId: latest.id,
          jobId,
          correlationId: req.id || null,
        })
        const jobKey = `match:target:${userId}:${tenantId}:${latest.version_label}:${jobId}`

        try {
          recordJobQueued({
            userId,
            tenantId,
            jobType: JOB_TYPES.RESUME_MATCHING,
            scopeType: 'match',
            scopeKey: `${tenantId}:${latest.version_label}:${jobId}`,
            queueName: QUEUE_NAMES.resumeMatching,
            jobName: resumeMatchingJobName(),
            bullmqJobId: jobKey,
            correlationId: req.id || null,
            payload,
            maxAttempts: Number(process.env.BULLMQ_ATTEMPTS || 5),
          })
        } catch {
          // ignore
        }

        await queues.resumeMatching.add(resumeMatchingJobName(), payload, { jobId: jobKey })
      }
    }
  } catch (err) {
    logger.warn({ err }, '[profile] enqueue match for target-job failed')
  }

  // If the latest resume isn't parsed yet, surface an "outdated" signal immediately.
  try {
    const latest = getLatestResumeVersion(db, userId)
    if (latest && String(latest.status || '').toUpperCase() !== 'PARSED') {
      emitActivityEvent({
        tenantId,
        userId,
        type: ACTIVITY_EVENT_TYPES.RESUME_OUTDATED,
        source: 'SYSTEM',
        status: 'INFO',
        relatedEntityType: 'job',
        relatedEntityId: jobId,
        correlationId: req.id || null,
        metadata: { reason: 'Resume is not parsed yet for target matching.' },
        notify: 'auto',
        db,
      })
    }
  } catch {
    // ignore
  }

  return res.status(201).json({ ok: true, jobId })
})

router.delete('/me/target-job/:jobId', authMiddleware, (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const tenantId = getTenantIdFromRequest(req)
  const jobId = String(req.params.jobId || '').trim()
  if (!jobId) return res.status(400).json({ message: 'jobId is required' })

  const now = new Date().toISOString()
  db.prepare(
    `UPDATE resume_targets
     SET is_active = 0, updated_at = ?
      WHERE user_id = ? AND tenant_id IS ? AND job_id = ?`
    ).run(now, userId, tenantId ? String(tenantId) : null, jobId)

  return res.json({ ok: true })
})

// Backward compatible routes
router.get('/:userId', authMiddleware, (req, res) => {
  const db = getDb()
  const { userId } = req.params
  if (!canReadUserParam(req, userId)) return res.status(403).json({ message: 'Forbidden' })
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })
  const row = ensureProfile(db, userId)
  return res.json({ profile: normalizeProfile(row) })
})

router.post('/:userId', authMiddleware, (req, res) => {
  const db = getDb()
  const { userId } = req.params
  if (!canWriteUserParam(req, userId)) return res.status(403).json({ message: 'Forbidden' })
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })
  const { college, branch, graduationYear, careerGoal, onboarded } = req.body || {}

  if (careerGoal !== undefined && !String(careerGoal).trim()) {
    return res.status(400).json({ message: 'Career goal is required' })
  }

  ensureProfile(db, userId)
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE profiles SET
      college = COALESCE(?, college),
      branch = COALESCE(?, branch),
      graduation_year = COALESCE(?, graduation_year),
      career_goal = COALESCE(?, career_goal),
      onboarded = COALESCE(?, onboarded),
      updated_at = ?
     WHERE user_id = ?`
  ).run(
    college ?? null,
    branch ?? null,
    graduationYear ?? null,
    careerGoal ?? null,
    typeof onboarded === 'boolean' ? (onboarded ? 1 : 0) : null,
    now,
    userId
  )

  const row = db.prepare(`SELECT * FROM profiles WHERE user_id = ?`).get(userId)
  return res.json({ profile: normalizeProfile(row) })
})

export default router
