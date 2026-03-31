import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getDb } from '../lib/db.js'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import multer from 'multer'
import { isQueueingAvailable, getQueues, enqueueWithTenantQuota } from '../lib/queues.js'
import {
  resumeProcessingJobName,
  makeResumeProcessingPayload,
  resumeRenderingJobName,
  makeResumeRenderingPayload,
} from '../lib/jobPayloads.js'
import {
  ensureResumeVersionForStructured,
  ensureResumeVersionForUpload,
  listResumeVersions,
  getLatestResumeVersion,
  getResumeParsedSnapshot,
  upsertLegacyResume,
  ensureDataDir,
} from '../lib/resumeDomain.js'
import { logger } from '../lib/logger.js'
import { createHashingDiskStorage } from '../lib/multerHashStorage.js'
import { redisRateLimit } from '../middleware/redisRateLimit.js'
import { writeAuditLog } from '../lib/auditDal.js'
import { emitActivityEvent } from '../lib/activityDal.js'
import { ACTIVITY_EVENT_TYPES, JOB_TYPES } from '../lib/activityTypes.js'
import { recordJobQueued } from '../lib/jobStatusDal.js'
import { QUEUE_NAMES } from '../lib/queues.js'
import { getTenantIdFromRequest } from '../lib/tenancy.js'
import { checkUsageLimit, incrementUsage } from '../lib/billing.js'
import { hasPermission } from '../lib/rbac.js'
import { requireUserInTenant } from '../lib/tenantScope.js'
import { validate } from '../lib/validate.js'
import { userIdParam, resumeTemplateBody, resumeRenderBody, renderIdParam, resumeVersionQuery, resumeSaveBody } from '../lib/schemas.js'
import { apiSuccess, apiCreated, apiError, apiNotFound, apiForbidden, apiTooMany } from '../lib/apiResponse.js'

const router = express.Router()

const uploadsDir = ensureDataDir(path.join('data', 'uploads', 'resumes'))

const upload = multer({
  storage: createHashingDiskStorage({
    destinationDir: uploadsDir,
    filename: (req, file) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.pdf'
      return `${crypto.randomUUID()}${ext}`
    },
  }),
  limits: {
    fileSize: Number(process.env.RESUME_UPLOAD_MAX_BYTES || 10 * 1024 * 1024),
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf']
    if (allowed.includes(file.mimetype)) return cb(null, true)
    cb(new Error('Only PDF files are accepted'))
  },
})

const limitResumeUpload = redisRateLimit({
  keyPrefix: 'rl:resume_upload',
  windowSec: Number(process.env.RL_RESUME_UPLOAD_WINDOW_SEC || 3600),
  max: Number(process.env.RL_RESUME_UPLOAD_MAX || 10),
  getIdentity: (req) => ({
    userId: req.user?.id || null,
    ip: req.ip,
    message: 'Too many resume uploads. Please try again later.',
  }),
})

const limitResumeRender = redisRateLimit({
  keyPrefix: 'rl:resume_render',
  windowSec: Number(process.env.RL_RESUME_RENDER_WINDOW_SEC || 3600),
  max: Number(process.env.RL_RESUME_RENDER_MAX || 20),
  getIdentity: (req) => ({
    userId: req.user?.id || null,
    ip: req.ip,
    message: 'Too many resume render requests. Please try again later.',
  }),
})

function defaultResume() {
  return {
    summary: '',
    education: [],
    skills: [],
    projects: [],
    experience: [],
  }
}

function loadResume(db, userId) {
  const row = db.prepare(`SELECT data_json FROM resumes WHERE user_id = ?`).get(userId)
  if (!row?.data_json) return null
  try {
    const parsed = JSON.parse(row.data_json)
    return {
      summary: parsed?.summary || '',
      education: parsed?.education || [],
      skills: parsed?.skills || [],
      projects: parsed?.projects || [],
      experience: parsed?.experience || [],
    }
  } catch {
    return null
  }
}

// Helper: Calculate resume quality score
function calculateQualityScore(resume) {
  let score = 0
  let maxScore = 100

  // Summary (15 points)
  if (resume.summary && resume.summary.trim().length > 50) score += 15

  // Education (20 points)
  if (resume.education && resume.education.length > 0) {
    score += 20
  }

  // Experience (25 points)
  if (resume.experience && resume.experience.length > 0) {
    score += Math.min(25, resume.experience.length * 8)
  }

  // Skills (20 points)
  if (resume.skills && resume.skills.length > 0) {
    score += Math.min(20, resume.skills.length * 2)
  }

  // Projects (20 points)
  if (resume.projects && resume.projects.length > 0) {
    score += Math.min(20, resume.projects.length * 5)
  }

  return Math.min(score, 100)
}

// Helper: Common job skills for gap analysis
const commonJobSkills = [
  'JavaScript',
  'Python',
  'React',
  'Node.js',
  'SQL',
  'Git',
  'REST APIs',
  'HTML',
  'CSS',
  'Problem Solving',
  'Communication',
  'Team Collaboration',
  'Project Management',
  'AWS',
  'Docker',
  'TypeScript',
  'Java',
  'Linux',
  'DevOps',
  'Testing',
]

// Helper: Find missing skills
function findMissingSkills(resumeSkills) {
  const userSkills = (resumeSkills || []).map((s) => s.toLowerCase())
  return commonJobSkills.filter(
    (skill) => !userSkills.some((s) => s.includes(skill.toLowerCase()) || skill.toLowerCase().includes(s))
  )
}

function canReadUserParam(req, requestedUserId) {
  if (String(req.user?.id || '') === String(requestedUserId || '')) return true
  return hasPermission(req.auth, 'platform:admin') || hasPermission(req.auth, 'users:read:any')
}

function canWriteUserParam(req, requestedUserId) {
  if (String(req.user?.id || '') === String(requestedUserId || '')) return true
  return hasPermission(req.auth, 'platform:admin')
}

// Save resume
router.post('/:userId', authMiddleware, validate({ params: userIdParam, body: resumeSaveBody }), (req, res) => {
  const { userId } = req.params
  const tenantId = getTenantIdFromRequest(req)
  const { summary, education, skills, projects, experience } = req.body

  if (!canWriteUserParam(req, userId)) {
    return apiForbidden(res)
  }

  const db = getDb()
  if (!requireUserInTenant(db, { tenantId, userId })) return apiForbidden(res)

  const resume = {
    summary: String(summary || ''),
    education: Array.isArray(education) ? education : [],
    skills: Array.isArray(skills) ? skills : [],
    projects: Array.isArray(projects) ? projects : [],
    experience: Array.isArray(experience) ? experience : [],
  }

  upsertLegacyResume(db, userId, resume)

  // Module 3: create a versioned resume and enqueue background processing.
  try {
    const created = ensureResumeVersionForStructured(db, {
      userId,
      structuredResume: resume,
      sourceMeta: { type: 'form', route: '/api/resume/:userId' },
    })

    try {
      if (created?.version?.id) {
        emitActivityEvent({
          tenantId,
          userId,
          type: ACTIVITY_EVENT_TYPES.RESUME_UPLOADED,
          source: 'API',
          status: 'SUCCESS',
          relatedEntityType: 'resume_version',
          relatedEntityId: String(created.version.id),
          correlationId: req.id || null,
          metadata: { resumeVersion: created.version.version_label, source: 'form' },
          notify: false,
          db,
        })
      }
    } catch {
      // ignore
    }

    try {
      writeAuditLog({
        actorType: 'USER',
        actorUserId: userId,
        action: 'RESUME_SAVE',
        targetType: 'resume_version',
        targetId: created?.version?.id ? String(created.version.id) : null,
        metadata: { source: 'form', deduped: !!created?.deduped },
        correlationId: req.id || null,
        db,
      })
    } catch {
      // ignore
    }

    if (
      isQueueingAvailable() &&
      created?.version?.version_label &&
      (created.deduped === false || String(created.version.status || '') !== 'PARSED')
    ) {
      const queues = getQueues()
      const payload = makeResumeProcessingPayload({
        userId,
        tenantId,
        resumeVersion: created.version.version_label,
        resumeVersionId: created.version.id,
        source: { type: 'form', route: '/api/resume/:userId' },
        correlationId: req.id || null,
      })
      const jobKey = `parse:${userId}:${created.version.version_label}:${created.version.content_hash}`

      try {
        recordJobQueued({
          userId,
          tenantId,
          jobType: JOB_TYPES.RESUME_PARSING,
          scopeType: 'resume_version',
          scopeKey: String(created.version.id || created.version.version_label),
          queueName: QUEUE_NAMES.resumeProcessing,
          jobName: resumeProcessingJobName(),
          bullmqJobId: jobKey,
          correlationId: req.id || null,
          payload,
          maxAttempts: Number(process.env.BULLMQ_ATTEMPTS || 5),
        })
      } catch {
        // ignore
      }

      queues.resumeProcessing
        .add(resumeProcessingJobName(), payload, { jobId: jobKey })
        .catch((err) => logger.warn({ err }, '[resume] enqueue resume_processing failed'))
    }
  } catch (err) {
    logger.warn({ err }, '[resume] versioned resume enqueue failed')
  }

  return apiSuccess(res, { message: 'Resume saved', resume })
})

// Module 3: Upload PDF resume (non-blocking). Returns a version label for downstream flows.
router.post('/me/upload', authMiddleware, limitResumeUpload, upload.single('file'), async (req, res, next) => {
  const userId = req.user.id
  const tenantId = getTenantIdFromRequest(req)
  const file = req.file
  if (!file?.path) return apiError(res, { status: 400, message: 'file is required' })

  const mime = String(file.mimetype || '').toLowerCase()
  if (mime && mime !== 'application/pdf') {
    fs.unlink(file.path).catch(() => {})
    return apiError(res, { status: 400, message: 'Only PDF uploads are supported' })
  }

  const db = getDb()

  // Plan enforcement: count accepted uploads against tenant quota.
  const uploadCheck = checkUsageLimit(db, { tenantId, featureKey: 'resume_uploads_per_month', incrementBy: 1 })
  if (!uploadCheck.ok) {
    fs.unlink(file.path).catch(() => {})
    return apiTooMany(res, { message: uploadCheck.message })
  }

  try {
    const contentHash = String(file.contentHash || '').trim()
    if (!contentHash) throw new Error('Upload hash missing')

    const created = ensureResumeVersionForUpload(db, {
      userId,
      contentHash,
      fileMeta: {
        storagePath: file.path,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        originalFilename: file.originalname,
        sourceMeta: { type: 'upload', field: 'file' },
      },
    })

    try {
      incrementUsage(db, { tenantId, featureKey: 'resume_uploads_per_month', incrementBy: 1 })
    } catch {
      // ignore
    }

    try {
      writeAuditLog({
        actorType: 'USER',
        actorUserId: userId,
        action: 'RESUME_UPLOAD',
        targetType: 'resume_version',
        targetId: created?.version?.id ? String(created.version.id) : null,
        metadata: {
          tenantId: tenantId || null,
          originalFilename: file.originalname,
          sizeBytes: file.size,
          deduped: !!created?.deduped,
        },
        correlationId: req.id || null,
        db,
      })
    } catch {
      // ignore
    }

    if (!created.deduped) {
      try {
        emitActivityEvent({
          tenantId,
          userId,
          type: ACTIVITY_EVENT_TYPES.RESUME_UPLOADED,
          source: 'API',
          status: 'SUCCESS',
          relatedEntityType: 'resume_version',
          relatedEntityId: String(created.version.id),
          correlationId: req.id || null,
          metadata: { resumeVersion: created.version.version_label, originalFilename: file.originalname },
          notify: false,
          db,
        })
      } catch {
        // ignore
      }
    }

    if (created.deduped) {
      // Avoid orphaned file when we dedupe to an existing version.
      fs.unlink(file.path).catch(() => {})
    }

    if (isQueueingAvailable() && !created.deduped) {
      const queues = getQueues()
      const payload = makeResumeProcessingPayload({
        userId,
        tenantId,
        resumeVersion: created.version.version_label,
        resumeVersionId: created.version.id,
        source: { type: 'upload', originalFilename: file.originalname },
        correlationId: req.id || null,
      })
      const jobKey = `parse:${userId}:${created.version.version_label}:${created.version.content_hash}`

      try {
        recordJobQueued({
          userId,
          tenantId,
          jobType: JOB_TYPES.RESUME_PARSING,
          scopeType: 'resume_version',
          scopeKey: String(created.version.id || created.version.version_label),
          queueName: QUEUE_NAMES.resumeProcessing,
          jobName: resumeProcessingJobName(),
          bullmqJobId: jobKey,
          correlationId: req.id || null,
          payload,
          maxAttempts: Number(process.env.BULLMQ_ATTEMPTS || 5),
        })
      } catch {
        // ignore
      }

      const enq = await enqueueWithTenantQuota(queues.resumeProcessing, {
        jobName: resumeProcessingJobName(),
        payload,
        jobId: jobKey,
        tenantId,
        featureKey: 'enqueue_resume_processing_per_minute',
        windowSec: 60,
        defaultMax: 60,
      })

      if (!enq.ok) {
        return apiTooMany(res, { message: enq.message, retryAfterSec: enq.retryAfterSec ?? 60 })
      }

      if (enq.warning) res.setHeader('X-StudentOS-Quota-Warn', enq.warning)
    }

    return apiSuccess(res, {
      deduped: !!created.deduped,
      resumeVersion: created.version.version_label,
      status: created.version.status,
    }, { status: 202 })
  } catch (err) {
    // Best-effort cleanup of uploaded file on error.
    fs.unlink(file.path).catch(() => {})
    return next(err)
  }
})

// Module 4: Manual retry for latest failed resume parsing job.
router.post('/me/retry', authMiddleware, async (req, res) => {
  if (!isQueueingAvailable()) return apiError(res, { status: 503, message: 'Resume processing queue is not available' })

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
    .get(userId, JOB_TYPES.RESUME_PARSING)

  if (!failed) return apiNotFound(res, 'No failed resume processing job found')

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
    .get(userId, JOB_TYPES.RESUME_PARSING, scopeKey, cutoff)
  if (Number(c?.n || 0) >= maxPerDay) {
    return apiTooMany(res, { message: 'Retry limit reached for today. Please try again later.' })
  }

  let payload
  try {
    payload = JSON.parse(failed.payload_json || '{}')
  } catch {
    payload = {}
  }

  if (!payload.userId) payload.userId = userId
  payload.correlationId = req.id || null

  const queues = getQueues()
  const jobKey = `parse:retry:${userId}:${scopeKey}:${Date.now()}`
  const tenantId = getTenantIdFromRequest(req)

  try {
    recordJobQueued({
      userId,
      jobType: JOB_TYPES.RESUME_PARSING,
      scopeType: failed.scope_type,
      scopeKey,
      queueName: QUEUE_NAMES.resumeProcessing,
      jobName: resumeProcessingJobName(),
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
      targetType: JOB_TYPES.RESUME_PARSING,
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
      jobType: JOB_TYPES.RESUME_PARSING,
      correlationId: req.id || null,
      metadata: { scopeKey },
      notify: false,
      db,
    })
  } catch {
    // ignore
  }

  const enq = await enqueueWithTenantQuota(queues.resumeProcessing, {
    jobName: resumeProcessingJobName(),
    payload,
    jobId: jobKey,
    tenantId,
    featureKey: 'enqueue_resume_processing_per_minute',
    windowSec: 60,
    defaultMax: 60,
  })

  if (!enq.ok) {
    return apiTooMany(res, { message: enq.message, retryAfterSec: enq.retryAfterSec ?? 60 })
  }

  if (enq.warning) res.setHeader('X-StudentOS-Quota-Warn', enq.warning)
  return apiSuccess(res, { enqueued: true }, { status: 202 })
})

// Module 3: List resume versions for the authenticated user.
router.get('/me/versions', authMiddleware, (req, res) => {
  const db = getDb()
  const items = listResumeVersions(db, req.user.id)
  return apiSuccess(res, { items })
})

// Module 3: Get latest resume version status and (optionally) snapshot.
router.get('/me/status', authMiddleware, validate({ query: resumeVersionQuery }), (req, res) => {
  const includeSnapshot = req.query?.includeSnapshot === 'true'
  const db = getDb()
  const latest = getLatestResumeVersion(db, req.user.id)
  if (!latest) return apiSuccess(res, { hasResume: false })

  const snapshot = includeSnapshot ? getResumeParsedSnapshot(db, latest.id) : null
  return apiSuccess(res, {
    hasResume: true,
    resumeVersion: latest.version_label,
    status: latest.status,
    errorText: latest.error_text || null,
    updatedAt: latest.updated_at,
    parsedAt: latest.parsed_at || null,
    snapshot,
  })
})

// Module 3: Create a LaTeX template (versioned by template_key).
router.post('/me/templates', authMiddleware, validate({ body: resumeTemplateBody }), (req, res) => {
  const db = getDb()
  const { templateKey, name, latexSource } = req.body

  const now = new Date().toISOString()
  const row = db
    .prepare('SELECT MAX(version) AS max_v FROM latex_templates WHERE template_key = ?')
    .get(templateKey)
  const nextVersion = Number(row?.max_v || 0) + 1

  const ins = db
    .prepare(
      `INSERT INTO latex_templates (template_key, version, name, latex_source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(templateKey, nextVersion, name, latexSource, now, now)

  const template = db.prepare('SELECT * FROM latex_templates WHERE id = ?').get(ins.lastInsertRowid)
  return apiCreated(res, { template })
})

// Module 3: Enqueue resume rendering (structured data -> LaTeX -> PDF).
router.post('/me/render', authMiddleware, limitResumeRender, validate({ body: resumeRenderBody }), async (req, res, next) => {
  const userId = req.user.id
  const tenantId = getTenantIdFromRequest(req)
  const { templateId, resumeVersion } = req.body

  if (!isQueueingAvailable()) return apiError(res, { status: 503, message: 'Rendering queue is not available' })

  const db = getDb()

  const renderCheck = checkUsageLimit(db, { tenantId, featureKey: 'resume_renders_per_month', incrementBy: 1 })
  if (!renderCheck.ok) {
    return apiTooMany(res, { message: renderCheck.message })
  }
  const versionRow = db
    .prepare(
      `SELECT rv.*
       FROM resume_versions rv
       JOIN resume_documents rd ON rd.id = rv.resume_document_id
       WHERE rd.user_id = ? AND rv.version_label = ?
       LIMIT 1`
    )
    .get(userId, resumeVersion)

  if (!versionRow) return apiNotFound(res, 'Resume version not found')

  const tmpl = db.prepare('SELECT id FROM latex_templates WHERE id = ?').get(templateId)
  if (!tmpl) return apiNotFound(res, 'Template not found')

  const now = new Date().toISOString()
  const ins = db
    .prepare(
      `INSERT INTO resume_renders
        (user_id, tenant_id, resume_version_label, resume_version_id, template_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'QUEUED', ?, ?)`
    )
    .run(userId, tenantId, resumeVersion, versionRow.id, templateId, now, now)

  const renderId = ins.lastInsertRowid

  try {
    incrementUsage(db, { tenantId, featureKey: 'resume_renders_per_month', incrementBy: 1 })
  } catch {
    // ignore
  }

  try {
    writeAuditLog({
      actorType: 'USER',
      actorUserId: userId,
      action: 'RESUME_REGENERATE',
      targetType: 'resume_render',
      targetId: String(renderId),
      metadata: { tenantId: tenantId || null, resumeVersion, templateId },
      correlationId: req.id || null,
      db,
    })
  } catch {
    // ignore
  }

  try {
    const queues = getQueues()
    const payload = {
      ...makeResumeRenderingPayload({
        userId,
        tenantId,
        resumeVersion,
        resumeVersionId: versionRow.id,
        templateId,
        correlationId: req.id || null,
      }),
      renderId,
    }
    const jobKey = `render:${userId}:${resumeVersion}:${templateId}:${renderId}`

    try {
      recordJobQueued({
        userId,
        tenantId,
        jobType: JOB_TYPES.RESUME_RENDERING,
        scopeType: 'render',
        scopeKey: String(renderId),
        queueName: QUEUE_NAMES.resumeRendering,
        jobName: resumeRenderingJobName(),
        bullmqJobId: jobKey,
        correlationId: req.id || null,
        payload,
        maxAttempts: Number(process.env.BULLMQ_ATTEMPTS || 5),
      })
    } catch {
      // ignore
    }

    const enq = await enqueueWithTenantQuota(queues.resumeRendering, {
      jobName: resumeRenderingJobName(),
      payload,
      jobId: jobKey,
      tenantId,
      featureKey: 'enqueue_resume_rendering_per_minute',
      windowSec: 60,
      defaultMax: 30,
    })

    if (!enq.ok) {
      return apiTooMany(res, { message: enq.message, retryAfterSec: enq.retryAfterSec ?? 60 })
    }

    if (enq.warning) res.setHeader('X-StudentOS-Quota-Warn', enq.warning)
    return apiSuccess(res, { renderId, status: 'QUEUED' }, { status: 202 })
  } catch (err) {
    return next(err)
  }
})

// Module 3: Poll render status (and download when READY).
router.get('/me/render/:renderId', authMiddleware, validate({ params: renderIdParam }), (req, res) => {
  const db = getDb()
  const renderId = req.params.renderId

  const tenantId = req.auth?.tenantId || null

  const row = db
    .prepare(
      `SELECT id, status, error_text, updated_at
       FROM resume_renders
       WHERE id = ? AND user_id = ? AND tenant_id IS ?
       LIMIT 1`
    )
    .get(renderId, req.user.id, tenantId ? String(tenantId) : null)
  if (!row) return apiNotFound(res, 'Render not found')
  return apiSuccess(res, { renderId: row.id, status: row.status, errorText: row.error_text || null, updatedAt: row.updated_at })
})

router.get('/me/render/:renderId/download', authMiddleware, validate({ params: renderIdParam }), async (req, res) => {
  const db = getDb()
  const renderId = req.params.renderId

  const tenantId = req.auth?.tenantId || null

  const row = db
    .prepare(
      `SELECT status, output_pdf_path
       FROM resume_renders
       WHERE id = ? AND user_id = ? AND tenant_id IS ?
       LIMIT 1`
    )
    .get(renderId, req.user.id, tenantId ? String(tenantId) : null)
  if (!row) return apiNotFound(res, 'Render not found')
  if (row.status !== 'READY') return apiError(res, { status: 409, message: 'Render not ready' })
  if (!row.output_pdf_path) return apiError(res, { status: 500, message: 'Missing output' })

  // Prevent path traversal — only serve files from the expected data directory.
  const resolved = path.resolve(row.output_pdf_path)
  const dataRoot = path.resolve('data')
  if (!resolved.startsWith(dataRoot + path.sep)) {
    return apiForbidden(res, 'Invalid file path')
  }

  return res.download(resolved, `resume-${renderId}.pdf`)
})

// Get resume
router.get('/:userId', authMiddleware, validate({ params: userIdParam }), (req, res) => {
  const { userId } = req.params
  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)

  if (!canReadUserParam(req, userId)) {
    return apiForbidden(res)
  }

  if (!requireUserInTenant(db, { tenantId, userId })) return apiForbidden(res)

  const resume = loadResume(db, userId) || defaultResume()
  return apiSuccess(res, resume)
})

// Analyze resume
router.post('/:userId/analyze', authMiddleware, validate({ params: userIdParam }), (req, res) => {
  const { userId } = req.params
  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)

  if (!canReadUserParam(req, userId)) {
    return apiForbidden(res)
  }

  if (!requireUserInTenant(db, { tenantId, userId })) return apiForbidden(res)

  const resume = loadResume(db, userId)

  if (!resume) {
    return apiNotFound(res, 'Resume not found')
  }

  const qualityScore = calculateQualityScore(resume)
  const missingSkills = findMissingSkills(resume.skills)

  // ATS Score (0-100)
  // Checks for ATS-friendly formatting
  let atsScore = 100
  if (!resume.summary) atsScore -= 20
  if (!resume.education || resume.education.length === 0) atsScore -= 25
  if (!resume.experience || resume.experience.length === 0) atsScore -= 25
  if (!resume.skills || resume.skills.length === 0) atsScore -= 20

  return apiSuccess(res, {
    qualityScore: Math.max(0, qualityScore),
    atsScore: Math.max(0, atsScore),
    missingSkills: missingSkills.slice(0, 10),
    totalCommonSkills: commonJobSkills.length,
    skillsCovered: resume.skills ? resume.skills.length : 0,
    completeness: {
      hasSummary: !!resume.summary,
      hasEducation: resume.education && resume.education.length > 0,
      hasExperience: resume.experience && resume.experience.length > 0,
      hasSkills: resume.skills && resume.skills.length > 0,
      hasProjects: resume.projects && resume.projects.length > 0,
    },
  })
})

export default router
