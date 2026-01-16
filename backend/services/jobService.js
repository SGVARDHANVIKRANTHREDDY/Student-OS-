import { ACTIVITY_EVENT_TYPES } from '../lib/activityTypes.js'
import { emitActivityEvent } from '../lib/activityDal.js'
import { writeAuditLog } from '../lib/auditDal.js'
import { createAdminJobDb, updateJobMarketplaceAdminDbWithLock } from '../repositories/jobsRepository.js'
import { JOB_STATUS, normalizeJobStatus, parseDeadlineAtForWrite, validateJobStatusTransition } from '../domain/job.js'
import { ServiceError } from '../domain/serviceErrors.js'
import { hasCapability, requiredLegacyPermissionsForCapability } from './capabilities.js'
import {
  parsePagination,
  parseCursorPagination,
  listJobs,
  listJobsCursor,
  getJobById,
  saveJob,
  unsaveJob,
} from '../lib/jobsDal.js'
import { getDb } from '../lib/db.js'
import { listLatestJobStatuses } from '../lib/jobStatusDal.js'
import { isQueueingAvailable, getQueues, QUEUE_NAMES } from '../lib/queues.js'
import { logger } from '../lib/logger.js'

function normalizeString(value) {
  return String(value || '').trim()
}

function parseIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return NaN
  return Math.trunc(n)
}

function mapJobRowToAdminApi(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    type: row.type,
    experienceLevel: row.experience_level,
    createdAt: row.created_at,
    isActive: row.is_active,
    // additive (backward-compatible)
    status: row.status || null,
    deadlineAt: row.deadline_at || null,
    updatedAt: row.updated_at || null,
    orgId: row.tenant_id || null,
  }
}

function mapJobRowToMarketplaceAdminPatchApi(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    type: row.type,
    experienceLevel: row.experience_level,
    createdAt: row.created_at,
    isActive: row.is_active,
    status: row.status || null,
    deadlineAt: row.deadline_at || null,
    updatedAt: row.updated_at || null,
  }
}

function requireCapabilityOrThrow(auth, capability, { message }) {
  if (hasCapability(auth, capability)) return

  throw new ServiceError({
    httpStatus: 403,
    code: 'FORBIDDEN',
    message: message || 'Forbidden',
    details: {
      capability: String(capability),
      requiredLegacyPermissions: requiredLegacyPermissionsForCapability(capability),
    },
  })
}

function queueForQueueName(queues, queueName) {
  if (!queueName) return null
  const qn = String(queueName)
  if (qn === QUEUE_NAMES.resumeProcessing) return queues.resumeProcessing
  if (qn === QUEUE_NAMES.resumeMatching) return queues.resumeMatching
  if (qn === QUEUE_NAMES.learningPlanGeneration) return queues.learningPlanGeneration
  if (qn === QUEUE_NAMES.resumeRendering) return queues.resumeRendering
  if (qn === QUEUE_NAMES.deadLetter) return queues.deadLetter
  return null
}

export async function getMyJobStatuses({ userId, type, limit = 50, correlationId = null } = {}) {
  const db = getDb()
  const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)))
  const jobType = String(type || '').trim() || null

  const rows = listLatestJobStatuses(db, String(userId), { limit: safeLimit, jobType })

  const items = rows.map((r) => ({
    id: r.id,
    jobType: r.job_type,
    status: r.status,
    scope: { type: r.scope_type, key: r.scope_key },
    queueName: r.queue_name || null,
    jobName: r.job_name || null,
    bullmqJobId: r.bullmq_job_id || null,
    correlationId: r.correlation_id || null,
    attemptsMade: Number(r.attempts_made || 0),
    maxAttempts: r.max_attempts === null || r.max_attempts === undefined ? null : Number(r.max_attempts),
    error: r.last_error_public || null,
    enqueuedAt: r.enqueued_at || null,
    startedAt: r.started_at || null,
    finishedAt: r.finished_at || null,
    updatedAt: r.updated_at,
  }))

  if (!isQueueingAvailable()) {
    return { items }
  }

  const queues = getQueues()
  const enriched = await Promise.all(
    items.map(async (it) => {
      if (!it.queueName || !it.bullmqJobId) return it
      try {
        const q = queueForQueueName(queues, it.queueName)
        if (!q) return it
        const job = await q.getJob(it.bullmqJobId)
        if (!job) return it
        const state = await job.getState()
        return { ...it, bullmqState: state }
      } catch (err) {
        logger.debug({ err, queueName: it.queueName, jobId: it.bullmqJobId, correlationId }, '[jobs] status enrich failed')
        return it
      }
    })
  )

  return { items: enriched }
}

export async function listMarketplaceJobs({ tenantId, userId, query } = {}) {
  const cursorPaging = parseCursorPagination({ query })
  if (cursorPaging.cursorError) {
    throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: cursorPaging.cursorError })
  }

  const type = String(query?.type || '').trim()
  const location = String(query?.location || '').trim()
  const experienceLevel = String(query?.experience || '').trim()
  const q = String(query?.q || '').trim()

  const filters = {
    type: type || undefined,
    location: location || undefined,
    experienceLevel: experienceLevel || undefined,
    q: q || undefined,
  }

  if (cursorPaging.cursor || String(query?.cursor || '').trim()) {
    const data = await listJobsCursor({
      tenantId,
      userId,
      filters,
      limit: cursorPaging.limit,
      cursor: cursorPaging.cursor,
    })
    return { ...data, mode: 'cursor' }
  }

  const { page, pageSize, offset } = parsePagination({ query })
  const data = await listJobs({ tenantId, userId, filters, page, pageSize, offset })
  return { ...data, mode: 'offset' }
}

export async function getMarketplaceJobById({ tenantId, userId, jobId } = {}) {
  const id = String(jobId || '').trim()
  if (!id) throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'Job id is required' })

  const job = await getJobById({ tenantId, userId, jobId: id })
  if (!job) throw new ServiceError({ httpStatus: 404, code: 'NOT_FOUND', message: 'Job not found' })
  return job
}

export async function saveMarketplaceJob({ tenantId, userId, jobId } = {}) {
  const id = String(jobId || '').trim()
  if (!id) throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'Job id is required' })

  const result = await saveJob({ tenantId, userId, jobId: id })
  if (!result.ok && result.code === 'NOT_FOUND') {
    throw new ServiceError({ httpStatus: 404, code: 'NOT_FOUND', message: 'Job not found' })
  }
  return { ok: true }
}

export async function unsaveMarketplaceJob({ tenantId, userId, jobId } = {}) {
  const id = String(jobId || '').trim()
  if (!id) throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'Job id is required' })

  await unsaveJob({ tenantId, userId, jobId: id })
  return { ok: true }
}

export async function createJobAdmin({ tenantId, actorUserId, auth, input, correlationId }) {
  requireCapabilityOrThrow(auth, 'job:create', {
    message: 'Forbidden: you are not allowed to create jobs.',
  })

  const title = normalizeString(input?.title)
  const company = normalizeString(input?.company)
  const location = normalizeString(input?.location)
  const jobType = normalizeString(input?.job_type)
  const experienceMin = parseIntOrNull(input?.experience_min)
  const experienceMax = parseIntOrNull(input?.experience_max)
  const description = normalizeString(input?.description)
  const isActive = input?.is_active === undefined ? true : Boolean(input?.is_active)

  const rawSkills = input?.skills
  const skills = Array.isArray(rawSkills) ? rawSkills.map((s) => normalizeString(s)).filter(Boolean).slice(0, 200) : []

  if (!title) throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'title is required' })
  if (!company) throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'company is required' })

  if (!jobType || !['INTERN', 'FULL_TIME'].includes(jobType)) {
    throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: "job_type must be 'INTERN' or 'FULL_TIME'" })
  }

  if (Number.isNaN(experienceMin) || Number.isNaN(experienceMax)) {
    throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'experience_min/experience_max must be integers' })
  }

  if (experienceMin !== null && experienceMin < 0) {
    throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'experience_min must be >= 0' })
  }

  if (experienceMax !== null && experienceMax < 0) {
    throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'experience_max must be >= 0' })
  }

  if (experienceMin !== null && experienceMax !== null && experienceMin > experienceMax) {
    throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'experience_min cannot exceed experience_max' })
  }

  // Map admin job_type to public API type.
  const type = jobType === 'INTERN' ? 'internship' : 'job'

  // Preserve existing read APIs: we still populate experienceLevel.
  let experienceLevel = 'Fresher'
  if (experienceMin !== null || experienceMax !== null) {
    const minLabel = experienceMin ?? 0
    const maxLabel = experienceMax ?? `${minLabel}+`
    experienceLevel = typeof maxLabel === 'string' ? `${minLabel}+ years` : `${minLabel}-${maxLabel} years`
  }

  const createdRow = await createAdminJobDb({
    tenantId,
    title,
    company,
    location: location || 'Remote',
    type,
    experienceLevel,
    experienceMin,
    experienceMax,
    description: description || 'Role details will be shared during the hiring process.',
    requirements: skills.length > 0 ? skills.join(', ') : 'Requirements will be shared during the hiring process.',
    skills,
    isActive,
  })

  if (!createdRow) {
    throw new ServiceError({ httpStatus: 500, code: 'INTERNAL', message: 'Failed to create job' })
  }

  // Admin action observability: audit + activity + notification.
  try {
    writeAuditLog({
      tenantId,
      actorType: 'USER',
      actorUserId,
      action: 'JOB_CREATE',
      targetType: 'job',
      targetId: createdRow.id,
      metadata: { isActive: createdRow.is_active },
      correlationId: correlationId || null,
    })
  } catch {
    // ignore
  }

  try {
    emitActivityEvent({
      tenantId,
      userId: actorUserId,
      type: ACTIVITY_EVENT_TYPES.JOB_LIFECYCLE_CHANGED,
      source: 'API',
      status: 'SUCCESS',
      relatedEntityType: 'job',
      relatedEntityId: createdRow.id,
      correlationId: correlationId || null,
      metadata: { toStatus: createdRow.status || 'OPEN', jobId: createdRow.id, jobTitle: createdRow.title },
      notify: true,
    })
  } catch {
    // ignore
  }

  return mapJobRowToAdminApi(createdRow)
}

export async function updateJobMarketplaceAdmin({ tenantId, actorUserId, auth, jobId, patch, correlationId }) {
  requireCapabilityOrThrow(auth, 'job:update', {
    message: 'Forbidden: you are not allowed to manage jobs.',
  })

  const id = String(jobId || '').trim()
  if (!id) throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'Job id is required' })

  const nextStatusRaw = patch?.status !== undefined ? String(patch.status).trim().toUpperCase() : null
  const nextStatus = nextStatusRaw ? normalizeJobStatus(nextStatusRaw) : null

  // Capability split (keeps current perms backward-compatible).
  if (nextStatus === JOB_STATUS.OPEN) requireCapabilityOrThrow(auth, 'job:open', { message: 'Forbidden: cannot open jobs.' })
  if (nextStatus === JOB_STATUS.CLOSED) requireCapabilityOrThrow(auth, 'job:close', { message: 'Forbidden: cannot close jobs.' })
  if (nextStatus === JOB_STATUS.ARCHIVED) requireCapabilityOrThrow(auth, 'job:archive', { message: 'Forbidden: cannot archive jobs.' })

  const deadlineParse = parseDeadlineAtForWrite(patch?.deadlineAt !== undefined ? patch.deadlineAt : undefined)
  if (!deadlineParse.ok) {
    throw new ServiceError({ httpStatus: 400, code: deadlineParse.code, message: deadlineParse.message })
  }

  const title = patch?.title !== undefined ? String(patch.title || '').trim() : undefined
  const company = patch?.company !== undefined ? String(patch.company || '').trim() : undefined
  const location = patch?.location !== undefined ? String(patch.location || '').trim() : undefined
  const description = patch?.description !== undefined ? String(patch.description || '').trim() : undefined
  const requirements = patch?.requirements !== undefined ? String(patch.requirements || '').trim() : undefined
  const skills = patch?.skills !== undefined ? (Array.isArray(patch.skills) ? patch.skills : []) : undefined

  const experienceMin = patch?.experienceMin !== undefined ? patch.experienceMin : undefined
  const experienceMax = patch?.experienceMax !== undefined ? patch.experienceMax : undefined

  const result = await updateJobMarketplaceAdminDbWithLock({
    tenantId,
    jobId: id,
    buildUpdate: async ({ current }) => {
      const currentStatus = normalizeJobStatus(current.status)
      if (currentStatus === JOB_STATUS.ARCHIVED) {
        return { ok: false, httpStatus: 409, code: 'READ_ONLY', message: 'Archived jobs are read-only.' }
      }

      const editingFieldsRequested =
        title !== undefined ||
        company !== undefined ||
        location !== undefined ||
        description !== undefined ||
        requirements !== undefined ||
        skills !== undefined ||
        experienceMin !== undefined ||
        experienceMax !== undefined ||
        deadlineParse.value !== undefined

      if (currentStatus === JOB_STATUS.CLOSED && editingFieldsRequested) {
        return { ok: false, httpStatus: 409, code: 'READ_ONLY', message: 'Closed jobs are read-only.' }
      }

      if (nextStatus) {
        const t = validateJobStatusTransition({ fromStatus: currentStatus, toStatus: nextStatus })
        if (!t.ok) {
          return { ok: false, httpStatus: 409, code: t.code, message: t.message }
        }
      }

      const sets = []
      const add = (columnSql, value) => {
        sets.push({ columnSql, value })
      }

      if (title !== undefined) add('title', title)
      if (company !== undefined) add('company', company)
      if (location !== undefined) add('location', location)
      if (description !== undefined) add('description', description)
      if (requirements !== undefined) add('requirements', requirements)
      if (skills !== undefined) add('skills', skills)
      if (experienceMin !== undefined) add('experience_min', experienceMin)
      if (experienceMax !== undefined) add('experience_max', experienceMax)
      if (deadlineParse.value !== undefined) add('deadline_at', deadlineParse.value)
      if (nextStatus) add('status', nextStatus)

      // Maintain previous behavior: lifecycle transitions set timestamps + archive disables is_active.
      if (nextStatus === JOB_STATUS.ARCHIVED) {
        add('is_active', false)
      }

      return { ok: true, sets, values: {} }
    },
  })

  if (!result.ok) {
    if (result.code === 'NOT_FOUND') throw new ServiceError({ httpStatus: 404, code: 'NOT_FOUND', message: 'Job not found' })
    throw new ServiceError({ httpStatus: result.httpStatus || 409, code: result.code || 'INVALID_STATE', message: result.message || 'Job update rejected' })
  }

  // Observability hooks for admin updates.
  const previousStatus = normalizeJobStatus(result.previous?.status)
  const nextStatusAfter = normalizeJobStatus(result.job?.status)

  try {
    writeAuditLog({
      tenantId,
      actorType: 'USER',
      actorUserId,
      action: 'JOB_UPDATE',
      targetType: 'job',
      targetId: id,
      metadata: {
        previousStatus: previousStatus || null,
        nextStatus: nextStatusAfter || null,
        patchKeys: Object.keys(patch || {}),
      },
      correlationId: correlationId || null,
    })
  } catch {
    // ignore
  }

  try {
    if ((patch || {}).status !== undefined) {
      emitActivityEvent({
        tenantId,
        userId: actorUserId,
        type: ACTIVITY_EVENT_TYPES.JOB_LIFECYCLE_CHANGED,
        source: 'API',
        status: 'SUCCESS',
        relatedEntityType: 'job',
        relatedEntityId: id,
        correlationId: correlationId || null,
        metadata: { fromStatus: previousStatus || null, toStatus: nextStatusAfter || null, jobId: id },
        notify: true,
      })
    }
  } catch {
    // ignore
  }

  try {
    if ((patch || {}).deadlineAt !== undefined) {
      emitActivityEvent({
        tenantId,
        userId: actorUserId,
        type: ACTIVITY_EVENT_TYPES.JOB_DEADLINE_CHANGED,
        source: 'API',
        status: 'SUCCESS',
        relatedEntityType: 'job',
        relatedEntityId: id,
        correlationId: correlationId || null,
        metadata: { jobId: id, deadlineAt: result.job?.deadline_at || null },
        notify: true,
      })
    }
  } catch {
    // ignore
  }

  return { ok: true, job: mapJobRowToMarketplaceAdminPatchApi(result.job) }
}
