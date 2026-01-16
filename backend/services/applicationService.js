import { ServiceError } from '../domain/serviceErrors.js'
import { hasCapability, requiredLegacyPermissionsForCapability } from './capabilities.js'
import { getDb } from '../lib/db.js'
import { checkUsageLimit, incrementUsage } from '../lib/billing.js'
import { isQueueingAvailable, getQueues, QUEUE_NAMES } from '../lib/queues.js'
import { resumeMatchingJobName, makeResumeMatchingPayload } from '../lib/jobPayloads.js'
import { getResumeVersionByLabel } from '../lib/resumeDomain.js'
import { logger } from '../lib/logger.js'
import { emitActivityEvent } from '../lib/activityDal.js'
import { ACTIVITY_EVENT_TYPES, JOB_TYPES } from '../lib/activityTypes.js'
import { writeAuditLog } from '../lib/auditDal.js'
import { recordJobQueued } from '../lib/jobStatusDal.js'

import { normalizeJobStatus, isDeadlinePassed, JOB_STATUS } from '../domain/job.js'
import {
  normalizeApplicationStatusForWrite,
  validateApplicationStatus,
  validateAdminStatusTransition,
} from '../domain/application.js'
import {
  createApplicationDb,
  listApplicationsDb,
  listApplicationsAdminDb,
  updateApplicationStatusAdminDb,
  autoRejectExpiredApplicationsDb,
} from '../repositories/applicationsRepository.js'

function clampInt(value, { min, max, fallback }) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

export function parsePaginationQuery(query) {
  const page = clampInt(query?.page, { min: 1, max: 10_000, fallback: 1 })
  const pageSize = clampInt(query?.pageSize, { min: 1, max: 50, fallback: 20 })
  return { page, pageSize, offset: (page - 1) * pageSize }
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

function mapApplicationRowToApi(row) {
  return {
    id: row.id,
    userId: row.user_id,
    jobId: row.job_id,
    resumeVersion: row.resume_version,
    status: row.status,
    appliedAt: row.applied_at,
    updatedAt: row.updated_at,
  }
}

export async function applyToJob({ tenantId, actorUserId, auth, jobId, resumeVersion, correlationId }) {
  // Students can only APPLY; admin apply is not a supported use-case.
  // We intentionally do not check for an "application:apply" permission to preserve existing behavior.
  const effectiveJobId = String(jobId || '').trim()
  const effectiveResumeVersion = String(resumeVersion || '').trim()

  if (!effectiveJobId) throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'jobId is required' })
  if (!effectiveResumeVersion) {
    throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'resumeVersion is required' })
  }

  // Plan enforcement: apply attempts are tenant-governed. (Backward compatible: best-effort only.)
  try {
    const db = getDb()
    const check = checkUsageLimit(db, { tenantId, featureKey: 'job_applications_per_month', incrementBy: 1 })
    if (!check.ok) {
      throw new ServiceError({
        httpStatus: 429,
        code: check.code,
        message: check.message,
        details: { limit: check.limit ?? null, used: check.used ?? null, period: check.period ?? null },
      })
    }
  } catch (err) {
    // If billing tables aren't available yet, do not block.
    if (err instanceof ServiceError) throw err
  }

  const created = await createApplicationDb({
    tenantId,
    userId: actorUserId,
    jobId: effectiveJobId,
    resumeVersion: effectiveResumeVersion,
  })

  if (!created.ok && created.code === 'JOB_NOT_FOUND') {
    throw new ServiceError({ httpStatus: 404, code: 'NOT_FOUND', message: 'Job not found' })
  }

  // Domain lifecycle: only OPEN accepts applications; deadline passed behaves like CLOSED.
  const jobStatus = normalizeJobStatus(created.job?.status)
  if (jobStatus && jobStatus !== JOB_STATUS.OPEN) {
    throw new ServiceError({
      httpStatus: 409,
      code: 'JOB_NOT_OPEN',
      message: `Applications are not open for this job (status: ${jobStatus}).`,
    })
  }

  if (isDeadlinePassed(created.job?.deadline_at)) {
    throw new ServiceError({
      httpStatus: 409,
      code: 'DEADLINE_PASSED',
      message: 'Applications are closed for this job (deadline passed).',
    })
  }

  if (!created.ok && created.code === 'DUPLICATE') {
    throw new ServiceError({ httpStatus: 409, code: 'DUPLICATE_APPLICATION', message: 'You have already applied to this job' })
  }

  if (!created.ok) {
    throw new ServiceError({ httpStatus: 500, code: 'INTERNAL', message: 'Failed to create application' })
  }

  // Increment usage best-effort (same as existing behavior).
  try {
    const db = getDb()
    incrementUsage(db, { tenantId, featureKey: 'job_applications_per_month', incrementBy: 1 })
  } catch {
    // ignore
  }

  // Trigger async matching (best-effort).
  try {
    if (isQueueingAvailable()) {
      const db = getDb()
      const rv = getResumeVersionByLabel(db, actorUserId, effectiveResumeVersion)
      const queues = getQueues()
      const payload = makeResumeMatchingPayload({
        userId: actorUserId,
        tenantId,
        resumeVersion: effectiveResumeVersion,
        resumeVersionId: rv?.id || null,
        jobId: effectiveJobId,
        correlationId: correlationId || null,
      })
      const jobKey = `match:apply:${actorUserId}:${tenantId || 'default'}:${effectiveResumeVersion}:${effectiveJobId}`

      try {
        recordJobQueued({
          userId: actorUserId,
          jobType: JOB_TYPES.RESUME_MATCHING,
          scopeType: 'match',
          scopeKey: `${tenantId || 'default'}:${effectiveResumeVersion}:${effectiveJobId}`,
          queueName: QUEUE_NAMES.resumeMatching,
          jobName: resumeMatchingJobName(),
          bullmqJobId: jobKey,
          correlationId: correlationId || null,
          payload,
          maxAttempts: Number(process.env.BULLMQ_ATTEMPTS || 5),
        })
      } catch {
        // ignore
      }

      await queues.resumeMatching.add(resumeMatchingJobName(), payload, { jobId: jobKey })
    }
  } catch (err) {
    logger.warn({ err }, '[applications] enqueue match failed')
  }

  // Observability: activity + audit.
  try {
    emitActivityEvent({
      tenantId,
      userId: actorUserId,
      type: ACTIVITY_EVENT_TYPES.JOB_APPLIED,
      source: 'API',
      status: 'SUCCESS',
      relatedEntityType: 'job',
      relatedEntityId: effectiveJobId,
      correlationId: correlationId || null,
      metadata: { tenantId: tenantId || null, resumeVersion: effectiveResumeVersion, jobId: effectiveJobId },
      notify: true,
    })
  } catch {
    // ignore
  }

  try {
    writeAuditLog({
      tenantId,
      actorType: 'USER',
      actorUserId,
      action: 'JOB_APPLY',
      targetType: 'job',
      targetId: effectiveJobId,
      metadata: { tenantId: tenantId || null, resumeVersion: effectiveResumeVersion },
      correlationId: correlationId || null,
    })
  } catch {
    // ignore
  }

  return mapApplicationRowToApi(created.applicationRow)
}

export async function autoRejectExpiredApplicationsWithEvents({ tenantId, jobId = null, correlationId = null } = {}) {
  const changed = await autoRejectExpiredApplicationsDb({ tenantId, jobId })

  for (const r of changed) {
    try {
      writeAuditLog({
        tenantId,
        actorType: 'SYSTEM',
        actorUserId: null,
        action: 'APPLICATION_AUTO_REJECT_DEADLINE',
        targetType: 'application',
        targetId: r.id,
        metadata: { jobId: r.job_id, fromStatus: r.previous_status || null, toStatus: r.status },
        correlationId: correlationId || null,
      })
    } catch {
      // ignore
    }

    try {
      emitActivityEvent({
        tenantId,
        userId: r.user_id,
        type: ACTIVITY_EVENT_TYPES.APPLICATION_STATUS_CHANGED,
        source: 'SYSTEM',
        status: 'SUCCESS',
        relatedEntityType: 'application',
        relatedEntityId: r.id,
        correlationId: correlationId || null,
        metadata: {
          jobId: r.job_id,
          applicationId: r.id,
          fromStatus: r.previous_status || null,
          toStatus: r.status,
          reason: 'Deadline passed',
          updatedAt: r.updated_at,
        },
        notify: true,
      })
    } catch {
      // ignore
    }
  }

  return changed
}

export async function listMyApplications({ tenantId, actorUserId, query, correlationId = null } = {}) {
  // Enforce deadline rule: after deadline, pending applications become REJECTED.
  // Best-effort, but auditing/events must happen if changes occur.
  try {
    await autoRejectExpiredApplicationsWithEvents({ tenantId, correlationId })
  } catch {
    // best-effort
  }

  const { page, pageSize, offset } = parsePaginationQuery(query || {})
  const data = await listApplicationsDb({ tenantId, userId: actorUserId, pageSize, offset })

  return {
    total: data.total,
    items: data.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      jobId: r.job_id,
      resumeVersion: r.resume_version,
      status: r.status,
      appliedAt: r.applied_at,
      updatedAt: r.updated_at,
      job: {
        id: r.job_id,
        title: r.title,
        company: r.company,
        location: r.location,
        type: r.type,
        experienceLevel: r.experience_level,
      },
    })),
    page,
    pageSize,
    hasNext: offset + pageSize < data.total,
  }
}

export async function listApplicationsAdmin({ tenantId, auth, query, correlationId = null } = {}) {
  requireCapabilityOrThrow(auth, 'application:read:any', {
    message: 'Forbidden',
  })

  const { page, pageSize, offset } = parsePaginationQuery(query || {})
  const jobId = query?.jobId ? String(query.jobId).trim() : null
  const status = query?.status ? String(query.status).trim() : null

  // Admin listing should also enforce deadline-based rejection.
  try {
    await autoRejectExpiredApplicationsWithEvents({ tenantId, jobId, correlationId })
  } catch {
    // best-effort
  }

  const rows = await listApplicationsAdminDb({ tenantId, jobId, status, limit: pageSize, offset })
  return { items: rows, page, pageSize, hasNext: rows.length === pageSize }
}

export async function updateApplicationStatusAdmin({ tenantId, actorUserId, auth, applicationId, status, correlationId = null }) {
  requireCapabilityOrThrow(auth, 'application:update_status', {
    message: 'Forbidden: you are not allowed to change application status.',
  })

  const id = String(applicationId || '').trim()
  if (!id) throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'Invalid application id' })

  const rawStatus = String(status || '').trim()
  if (!rawStatus) throw new ServiceError({ httpStatus: 400, code: 'INVALID_INPUT', message: 'status is required' })

  const v = validateApplicationStatus(rawStatus)
  if (!v.ok) {
    throw new ServiceError({ httpStatus: 400, code: v.code, message: v.message })
  }

  const nextStatusValue = normalizeApplicationStatusForWrite(rawStatus)

  const updated = await updateApplicationStatusAdminDb({ tenantId, applicationId: id, nextStatusValue })
  if (!updated) throw new ServiceError({ httpStatus: 404, code: 'NOT_FOUND', message: 'Application not found' })

  // Centralize transition validation even though DB already accepted the write.
  // This is an intentional step toward tighter invariants without route logic.
  const transition = validateAdminStatusTransition({ fromStatus: updated.previous_status, toStatus: rawStatus })
  if (!transition.ok) {
    throw new ServiceError({ httpStatus: 400, code: transition.code, message: transition.message })
  }

  try {
    writeAuditLog({
      tenantId,
      actorType: 'USER',
      actorUserId,
      action: 'APPLICATION_STATUS_CHANGE',
      targetType: 'application',
      targetId: id,
      metadata: {
        fromStatus: updated.previous_status || null,
        toStatus: updated.status,
        jobId: updated.job_id,
        applicantUserId: updated.user_id,
      },
      correlationId: correlationId || null,
    })
  } catch {
    // ignore
  }

  try {
    emitActivityEvent({
      tenantId,
      userId: updated.user_id,
      type: ACTIVITY_EVENT_TYPES.APPLICATION_STATUS_CHANGED,
      source: 'API',
      status: 'SUCCESS',
      relatedEntityType: 'application',
      relatedEntityId: id,
      correlationId: correlationId || null,
      metadata: {
        jobId: updated.job_id,
        applicationId: id,
        fromStatus: updated.previous_status || null,
        toStatus: updated.status,
        updatedAt: updated.updated_at,
      },
      notify: true,
    })
  } catch {
    // ignore
  }

  return {
    ok: true,
    application: {
      id: updated.id,
      job_id: updated.job_id,
      user_id: updated.user_id,
      status: updated.status,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      previous_status: updated.previous_status,
    },
  }
}
