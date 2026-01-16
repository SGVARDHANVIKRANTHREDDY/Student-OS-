import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getDb } from '../lib/db.js'
import { getTenantIdFromRequest } from '../lib/tenancy.js'
import { requireUserInTenant } from '../lib/tenantScope.js'
import { listUserSkills, upsertUserSkills } from '../lib/userSkillsDal.js'
import { getLatestResumeVersion } from '../lib/resumeDomain.js'
import { isQueueingAvailable, getQueues } from '../lib/queues.js'
import { enqueueWithTenantQuota } from '../lib/queues.js'
import { resumeMatchingJobName, makeResumeMatchingPayload } from '../lib/jobPayloads.js'
import { logger } from '../lib/logger.js'
import { isPgConfigured } from '../lib/pg.js'
import { redisRateLimit } from '../middleware/redisRateLimit.js'
import { checkAndIncrementUsage } from '../lib/billing.js'
import { writeAuditLog } from '../lib/auditDal.js'
import { recordJobQueued } from '../lib/jobStatusDal.js'
import { ACTIVITY_EVENT_TYPES, JOB_TYPES } from '../lib/activityTypes.js'
import { emitActivityEvent } from '../lib/activityDal.js'
import { QUEUE_NAMES } from '../lib/queues.js'

const router = express.Router()

const limitMatchingTrigger = redisRateLimit({
  keyPrefix: 'rl:matching_trigger',
  windowSec: Number(process.env.RL_MATCHING_WINDOW_SEC || 3600),
  max: Number(process.env.RL_MATCHING_MAX || 60),
  getIdentity: (req) => ({
    tenantId: getTenantIdFromRequest(req),
    userId: req.user?.id || null,
    ip: req.ip,
    message: 'Too many matching requests. Please try again later.',
  }),
})

const limitMatchingRetry = redisRateLimit({
  keyPrefix: 'rl:matching_retry',
  windowSec: Number(process.env.RL_MATCHING_RETRY_WINDOW_SEC || 3600),
  max: Number(process.env.RL_MATCHING_RETRY_MAX || 10),
  getIdentity: (req) => ({
    tenantId: getTenantIdFromRequest(req),
    userId: req.user?.id || null,
    ip: req.ip,
    message: 'Too many retry requests. Please try again later.',
  }),
})

function parseJsonArray(value) {
  try {
    const arr = JSON.parse(value || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function parseJsonObject(value) {
  try {
    const obj = JSON.parse(value || '{}')
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

// Module 3: list stored match results (never recompute blindly).
router.get('/me/results', authMiddleware, (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const tenantId = getTenantIdFromRequest(req)
  const resumeVersion = String(req.query?.resumeVersion || '').trim()

  const effectiveResumeVersion = resumeVersion || getLatestResumeVersion(db, userId)?.version_label
  if (!effectiveResumeVersion) return res.json({ items: [] })

  const rows = db
    .prepare(
      `SELECT job_id, algorithm_version, match_score, breakdown_json, missing_skills_json, strengths_json, updated_at
       FROM resume_job_matches
       WHERE user_id = ? AND tenant_id IS ? AND resume_version_label = ?
       ORDER BY updated_at DESC
       LIMIT 100`
    )
    .all(userId, tenantId ? String(tenantId) : null, effectiveResumeVersion)

  return res.json({
    resumeVersion: effectiveResumeVersion,
    items: rows.map((r) => ({
      jobId: r.job_id,
      algorithmVersion: r.algorithm_version,
      score: r.match_score,
      breakdown: parseJsonObject(r.breakdown_json),
      missingSkills: parseJsonArray(r.missing_skills_json),
      strengths: parseJsonArray(r.strengths_json),
      updatedAt: r.updated_at,
    })),
  })
})

router.get('/me/results/:jobId', authMiddleware, (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const tenantId = getTenantIdFromRequest(req)
  const jobId = String(req.params.jobId || '').trim()
  const resumeVersion = String(req.query?.resumeVersion || '').trim()

  if (!jobId) return res.status(400).json({ message: 'jobId is required' })

  const effectiveResumeVersion = resumeVersion || getLatestResumeVersion(db, userId)?.version_label
  if (!effectiveResumeVersion) return res.status(404).json({ message: 'No resume version found' })

  const r = db
    .prepare(
      `SELECT job_id, algorithm_version, match_score, breakdown_json, missing_skills_json, strengths_json, updated_at
       FROM resume_job_matches
       WHERE user_id = ? AND tenant_id IS ? AND resume_version_label = ? AND job_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get(userId, tenantId ? String(tenantId) : null, effectiveResumeVersion, jobId)

  if (!r) return res.status(404).json({ message: 'Match not found' })
  return res.json({
    resumeVersion: effectiveResumeVersion,
    jobId: r.job_id,
    algorithmVersion: r.algorithm_version,
    score: r.match_score,
    breakdown: parseJsonObject(r.breakdown_json),
    missingSkills: parseJsonArray(r.missing_skills_json),
    strengths: parseJsonArray(r.strengths_json),
    updatedAt: r.updated_at,
  })
})

// Module 3: enqueue matching job and return immediately.
router.post('/me/enqueue', authMiddleware, limitMatchingTrigger, async (req, res) => {
  if (!isQueueingAvailable()) return res.status(503).json({ message: 'Matching queue is not available' })
  if (!isPgConfigured()) return res.status(503).json({ message: 'Jobs database is not configured' })

  const db = getDb()
  const userId = req.user.id
  const tenantId = getTenantIdFromRequest(req)
  const jobId = String(req.body?.jobId || '').trim()
  const resumeVersion = String(req.body?.resumeVersion || '').trim()

  if (!jobId) return res.status(400).json({ message: 'jobId is required' })

  const effectiveResumeVersion = resumeVersion || getLatestResumeVersion(db, userId)?.version_label
  if (!effectiveResumeVersion) return res.status(404).json({ message: 'No resume version found' })

  // Plan-aware usage metering (durable): cap expensive match triggers.
  const usage = checkAndIncrementUsage(db, { tenantId, featureKey: 'matching_triggers_per_hour', incrementBy: 1, period: 'hour' })
  if (!usage.ok) {
    return res.status(429).json({
      message: usage.message,
      code: usage.code,
      limit: usage.limit ?? null,
      used: usage.used ?? null,
      period: usage.period ?? null,
    })
  }

  const rv = db
    .prepare(
      `SELECT rv.id
       FROM resume_versions rv
       JOIN resume_documents rd ON rd.id = rv.resume_document_id
       WHERE rd.user_id = ? AND rv.version_label = ?
       LIMIT 1`
    )
    .get(userId, effectiveResumeVersion)

  try {
    const queues = getQueues()
    const payload = makeResumeMatchingPayload({
      userId,
      tenantId,
      resumeVersion: effectiveResumeVersion,
      resumeVersionId: rv?.id || null,
      jobId,
      correlationId: req.id || null,
    })
    const jobKey = `match:manual:${userId}:${tenantId}:${effectiveResumeVersion}:${jobId}`

    try {
      recordJobQueued({
        userId,
        tenantId,
        jobType: JOB_TYPES.RESUME_MATCHING,
        scopeType: 'match',
        scopeKey: `${tenantId}:${effectiveResumeVersion}:${jobId}`,
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

    try {
      writeAuditLog({
        tenantId,
        actorType: 'USER',
        actorUserId: userId,
        action: 'MATCH_TRIGGER',
        targetType: 'job',
        targetId: jobId,
        metadata: { resumeVersion: effectiveResumeVersion },
        correlationId: req.id || null,
      })
    } catch {
      // ignore
    }

    const enq = await enqueueWithTenantQuota(queues.resumeMatching, {
      jobName: resumeMatchingJobName(),
      payload,
      jobId: jobKey,
      tenantId,
      featureKey: 'enqueue_resume_matching_per_minute',
      windowSec: 60,
      defaultMax: 120,
    })

    if (!enq.ok) {
      return res.status(429).json({
        message: enq.message,
        code: enq.code,
        limit: enq.limit ?? null,
        used: enq.used ?? null,
        retryAfterSec: enq.retryAfterSec ?? 60,
      })
    }

    if (enq.warning) res.setHeader('X-StudentOS-Quota-Warn', enq.warning)
    return res.status(202).json({ ok: true, enqueued: true, resumeVersion: effectiveResumeVersion })
  } catch (err) {
    logger.warn({ err }, '[matching] enqueue failed')
    return res.status(500).json({ message: 'Failed to enqueue match job' })
  }
})

// Module 4: Manual retry for latest failed matching job.
router.post('/me/retry', authMiddleware, limitMatchingRetry, async (req, res) => {
  if (!isQueueingAvailable()) return res.status(503).json({ message: 'Matching queue is not available' })
  if (!isPgConfigured()) return res.status(503).json({ message: 'Jobs database is not configured' })

  const userId = req.user.id
  const db = getDb()

  const failed = db
    .prepare(
      `SELECT *
       FROM job_status_snapshots
       WHERE user_id = ? AND job_type = ? AND status = 'FAILED'
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get(userId, JOB_TYPES.RESUME_MATCHING)

  if (!failed) return res.status(404).json({ message: 'No failed matching job found' })

  const tenantId = getTenantIdFromRequest(req)
  const usage = checkAndIncrementUsage(db, { tenantId, featureKey: 'matching_retries_per_hour', incrementBy: 1, period: 'hour' })
  if (!usage.ok) {
    return res.status(429).json({
      message: usage.message,
      code: usage.code,
      limit: usage.limit ?? null,
      used: usage.used ?? null,
      period: usage.period ?? null,
    })
  }

  const scopeKey = String(failed.scope_key)
  const maxPerDay = Number(process.env.MANUAL_RETRY_MAX_PER_DAY || 3)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const c = db
    .prepare(
      `SELECT COUNT(1) AS n
       FROM audit_logs
       WHERE actor_user_id = ?
         AND action = 'MANUAL_RETRY'
         AND target_type = ?
         AND target_id = ?
         AND created_at >= ?`
    )
    .get(userId, JOB_TYPES.RESUME_MATCHING, scopeKey, cutoff)
  if (Number(c?.n || 0) >= maxPerDay) {
    return res.status(429).json({ message: 'Retry limit reached for today. Please try again later.' })
  }

  let payload
  try {
    payload = JSON.parse(failed.payload_json || '{}')
  } catch {
    payload = {}
  }
  payload.userId = userId
  payload.correlationId = req.id || null

  const queues = getQueues()
  const jobKey = `match:retry:${userId}:${scopeKey}:${Date.now()}`

  try {
    recordJobQueued({
      userId,
      jobType: JOB_TYPES.RESUME_MATCHING,
      scopeType: failed.scope_type,
      scopeKey,
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

  try {
    writeAuditLog({
      actorType: 'USER',
      actorUserId: userId,
      action: 'MANUAL_RETRY',
      targetType: JOB_TYPES.RESUME_MATCHING,
      targetId: scopeKey,
      metadata: { previousSnapshotId: failed.id },
      correlationId: req.id || null,
      db,
    })
  } catch {
    // ignore
  }

  try {
    emitActivityEvent({
      userId,
      type: ACTIVITY_EVENT_TYPES.MANUAL_RETRY_REQUESTED,
      source: 'API',
      status: 'SUCCESS',
      jobType: JOB_TYPES.RESUME_MATCHING,
      correlationId: req.id || null,
      metadata: { scopeKey },
      notify: false,
      db,
    })
  } catch {
    // ignore
  }

  const enq = await enqueueWithTenantQuota(queues.resumeMatching, {
    jobName: resumeMatchingJobName(),
    payload,
    jobId: jobKey,
    tenantId,
    featureKey: 'enqueue_resume_matching_per_minute',
    windowSec: 60,
    defaultMax: 120,
  })

  if (!enq.ok) {
    return res.status(429).json({
      message: enq.message,
      code: enq.code,
      limit: enq.limit ?? null,
      used: enq.used ?? null,
      retryAfterSec: enq.retryAfterSec ?? 60,
    })
  }

  if (enq.warning) res.setHeader('X-StudentOS-Quota-Warn', enq.warning)
  return res.status(202).json({ ok: true, enqueued: true })
})

// Common job roles with required skills
const jobRoles = {
  'frontend-engineer': {
    title: 'Frontend Engineer',
    requiredSkills: ['JavaScript', 'React', 'HTML', 'CSS', 'Git'],
    preferredSkills: ['TypeScript', 'Testing', 'REST APIs', 'Responsive Design'],
  },
  'backend-engineer': {
    title: 'Backend Engineer',
    requiredSkills: ['Node.js', 'Python', 'Databases', 'REST APIs', 'Git'],
    preferredSkills: ['Docker', 'SQL', 'Authentication', 'Microservices'],
  },
  'full-stack-developer': {
    title: 'Full Stack Developer',
    requiredSkills: ['JavaScript', 'React', 'Node.js', 'Databases', 'Git'],
    preferredSkills: ['TypeScript', 'Docker', 'AWS', 'Testing'],
  },
  'data-scientist': {
    title: 'Data Scientist',
    requiredSkills: ['Python', 'SQL', 'Statistics', 'Machine Learning', 'Data Analysis'],
    preferredSkills: ['TensorFlow', 'Deep Learning', 'Big Data', 'Visualization'],
  },
  'devops-engineer': {
    title: 'DevOps Engineer',
    requiredSkills: ['Docker', 'Linux', 'CI/CD', 'AWS', 'Git'],
    preferredSkills: ['Kubernetes', 'Terraform', 'Jenkins', 'Monitoring'],
  },
}

// Helper: Extract skills from text
function extractSkillsFromText(text) {
  const commonSkills = [
    'JavaScript',
    'Python',
    'React',
    'Node.js',
    'SQL',
    'Git',
    'REST APIs',
    'HTML',
    'CSS',
    'TypeScript',
    'Testing',
    'Docker',
    'AWS',
    'Linux',
    'CI/CD',
    'Databases',
    'Authentication',
    'Microservices',
    'Problem Solving',
    'Communication',
    'Team Collaboration',
    'Project Management',
    'Java',
    'Go',
    'Rust',
    'MongoDB',
    'PostgreSQL',
    'Redis',
  ]

  const found = []
  const lowerText = text.toLowerCase()
  
  commonSkills.forEach((skill) => {
    if (lowerText.includes(skill.toLowerCase())) {
      found.push(skill)
    }
  })

  return [...new Set(found)]
}

// Helper: Calculate match percentage
function calculateMatch(resumeSkills, jobSkills) {
  const resumeSkillsLower = resumeSkills.map((s) => s.toLowerCase())
  const jobSkillsLower = jobSkills.map((s) => s.toLowerCase())

  const matched = jobSkillsLower.filter((skill) =>
    resumeSkillsLower.some((rs) => rs.includes(skill) || skill.includes(rs))
  )

  return Math.round((matched.length / jobSkillsLower.length) * 100)
}

// Match resume against job description
router.post('/:userId/match', authMiddleware, (req, res) => {
  const { userId } = req.params
  const { jobDescription, roleId, resume } = req.body

  if (!jobDescription && !roleId) {
    return res.status(400).json({ message: 'Job description or role ID required' })
  }

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })

  // Get job requirements
  let jobRequirements = { requiredSkills: [], preferredSkills: [] }
  let jobTitle = 'Custom Role'

  if (roleId && jobRoles[roleId]) {
    const role = jobRoles[roleId]
    jobRequirements = {
      requiredSkills: role.requiredSkills,
      preferredSkills: role.preferredSkills,
    }
    jobTitle = role.title
  } else if (jobDescription) {
    // Extract skills from job description
    const extractedSkills = extractSkillsFromText(jobDescription)
    jobRequirements.requiredSkills = extractedSkills.slice(0, 5)
    jobRequirements.preferredSkills = extractedSkills.slice(5, 10)
  }

  // Get resume skills from persistent profile only.
  let profileSkills = []
  try {
    profileSkills = listUserSkills(db, { tenantId, userId })
  } catch {
    profileSkills = []
  }

  // Backward-compatible bootstrap: if profile is empty, seed from request resume.skills (if present).
  if ((!profileSkills || profileSkills.length === 0) && resume && Array.isArray(resume.skills) && resume.skills.length > 0) {
    try {
      upsertUserSkills(db, { tenantId, userId, skills: resume.skills, source: 'manual', proficiency: 30 })
      profileSkills = listUserSkills(db, { tenantId, userId })
    } catch {
      // ignore
    }
  }

  const resumeSkills = (profileSkills || []).map((s) => s.name)

  // Calculate required skills match
  const requiredMatch = calculateMatch(resumeSkills, jobRequirements.requiredSkills)
  const preferredMatch = calculateMatch(resumeSkills, jobRequirements.preferredSkills)

  // Overall match (70% required, 30% preferred)
  const overallMatch = Math.round(requiredMatch * 0.7 + preferredMatch * 0.3)

  // Identify strengths
  const resumeSkillsLower = resumeSkills.map((s) => s.toLowerCase())
  const strengths = jobRequirements.requiredSkills.filter((skill) =>
    resumeSkillsLower.some((rs) => rs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(rs))
  )

  // Identify missing skills
  const allJobSkills = [...jobRequirements.requiredSkills, ...jobRequirements.preferredSkills]
  const missing = allJobSkills.filter(
    (skill) => !resumeSkillsLower.some((rs) => rs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(rs))
  )

  // Decision recommendation
  let decision = 'APPLY'
  let reason = ''

  if (overallMatch >= 80) {
    decision = 'APPLY'
    reason = 'Strong match! Your resume aligns well with this role.'
  } else if (overallMatch >= 60) {
    decision = 'APPLY'
    reason = 'Good match with some skill gaps. Consider improving before applying.'
  } else if (overallMatch >= 40) {
    decision = 'IMPROVE'
    reason = 'Notable skill gaps. Focus on building missing skills first.'
  } else {
    decision = 'IMPROVE'
    reason = 'Significant skill mismatch. Develop core skills before applying.'
  }

  res.json({
    jobTitle,
    matchPercentage: overallMatch,
    requiredMatch,
    preferredMatch,
    strengths: strengths.slice(0, 5),
    missingSkills: missing.slice(0, 10),
    decision,
    reason,
    jobRequirements,
    resumeSkills,
  })
})

// Get available job roles
router.get('/roles/list', authMiddleware, (req, res) => {
  const roles = Object.entries(jobRoles).map(([id, role]) => ({
    id,
    title: role.title,
    skills: [...role.requiredSkills, ...role.preferredSkills],
  }))

  res.json(roles)
})

export default router
