import dotenv from 'dotenv'
import { Worker } from 'bullmq'
import { getRedisConnection, isRedisConfigured, closeRedisConnection } from './lib/redis.js'
import { closeQueues, getQueues, QUEUE_NAMES } from './lib/queues.js'
import { logger } from './lib/logger.js'
import { closeDb, getDb } from './lib/db.js'
import { closePgPools } from './lib/pg.js'
import { processResume } from './workers/resumeProcessing.js'
import { processMatch } from './workers/resumeMatching.js'
import { processLearningPlan } from './workers/learningPlanGeneration.js'
import { processRender } from './workers/resumeRendering.js'
import { recordJobRunning, recordJobCompleted, recordJobFailed } from './lib/jobStatusDal.js'
import { emitActivityEvent } from './lib/activityDal.js'
import { ACTIVITY_EVENT_TYPES, JOB_TYPES } from './lib/activityTypes.js'
import { toPublicError } from './lib/publicErrors.js'
import { getAccountState } from './lib/accountLifecycle.js'
import { effectiveTenantId } from './lib/tenancy.js'
import { requireUserInTenant } from './lib/tenantScope.js'

dotenv.config()

if (!isRedisConfigured()) {
  logger.fatal('Redis not configured. Set REDIS_URL or REDIS_HOST/REDIS_PORT to run workers.')
  process.exit(1)
}

// Ensure DB is initialized and migrations are applied.
getDb()

const connection = getRedisConnection()
const queues = getQueues()

const concurrency = {
  resumeProcessing: Number(process.env.WORKER_CONCURRENCY_RESUME_PROCESSING || 4),
  resumeMatching: Number(process.env.WORKER_CONCURRENCY_RESUME_MATCHING || 8),
  learningPlan: Number(process.env.WORKER_CONCURRENCY_LEARNING_PLAN || 4),
  resumeRendering: Number(process.env.WORKER_CONCURRENCY_RESUME_RENDERING || 2),
}

function withDlq({ queueName, processor }) {
  return async (job) => {
    try {
      enforceWorkerAuthz(queueName, job)
      const derived = deriveJobContext(queueName, job)

      // Account lifecycle guard: never do expensive work for suspended/deleted accounts.
      // Important: do NOT throw (would cause retries); instead record FAILED and return a sentinel
      // to prevent the 'completed' handler from overwriting status.
      if (derived?.userId) {
        const { status } = getAccountState(getDb(), derived.userId)
        if (status !== 'ACTIVE') {
          if (derived?.scopeType && derived?.scopeKey && derived?.jobType) {
            recordJobFailed({
              userId: derived.userId,
              tenantId: derived.tenantId || null,
              jobType: derived.jobType,
              scopeType: derived.scopeType,
              scopeKey: derived.scopeKey,
              attemptsMade: job?.attemptsMade,
              correlationId: derived.correlationId,
              errorPublic: 'Account is not active',
              errorCode: 'ACCOUNT_INACTIVE',
            })
          }

          return { _skipJobStatus: true, _skipped: true, reason: 'ACCOUNT_INACTIVE', status }
        }
      }
      if (derived?.userId && derived?.scopeType && derived?.scopeKey && derived?.jobType) {
        recordJobRunning({
          userId: derived.userId,
          tenantId: derived.tenantId || null,
          jobType: derived.jobType,
          scopeType: derived.scopeType,
          scopeKey: derived.scopeKey,
          attemptsMade: job.attemptsMade,
          correlationId: derived.correlationId,
        })
      }

      return await processor(job)
    } catch (err) {
      const derived = deriveJobContext(queueName, job)
      const publicReason = toPublicError(err)

      const code = String(err?.message || '').toLowerCase().includes('forbidden')
        ? 'FORBIDDEN'
        : String(err?.message || '').toLowerCase().includes('tenant access denied')
          ? 'TENANT_ACCESS'
          : 'WORKER_FAILED'

      if (derived?.userId && derived?.scopeType && derived?.scopeKey && derived?.jobType) {
        recordJobFailed({
          userId: derived.userId,
          tenantId: derived.tenantId || null,
          jobType: derived.jobType,
          scopeType: derived.scopeType,
          scopeKey: derived.scopeKey,
          attemptsMade: job?.attemptsMade,
          correlationId: derived.correlationId,
          errorPublic: publicReason,
          errorCode: code,
        })
      }

      if (derived?.userId) {
        const evt = activityEventFor(queueName, { success: false })
        if (evt) {
          try {
            emitActivityEvent({
              tenantId: derived.tenantId || null,
              userId: derived.userId,
              type: evt,
              source: 'WORKER',
              status: 'FAILED',
              relatedEntityType: derived.relatedEntityType,
              relatedEntityId: derived.relatedEntityId,
              jobType: derived.jobType,
              bullmqJobId: String(job?.id || ''),
              correlationId: derived.correlationId,
              metadata: {
                reason: publicReason,
                scopeType: derived.scopeType,
                scopeKey: derived.scopeKey,
              },
              notify: 'auto',
            })
          } catch {
            // never fail the worker because of an observability write
          }
        }
      }

      // Dead-letter safety: copy to durable DLQ for inspection/replay.
      try {
        await queues.deadLetter.add(
          `${job.name}.failed`,
          {
            queue: queueName,
            originalJobId: job.id,
            name: job.name,
            data: job.data,
            failedAt: new Date().toISOString(),
            error: String(err?.message || err),
          },
          {
            jobId: `dlq:${queueName}:${job.id}:${Date.now()}`,
            removeOnComplete: 5_000,
            removeOnFail: false,
          }
        )
      } catch (dlqErr) {
        logger.error({ err: dlqErr }, '[worker] failed to enqueue DLQ entry')
      }
      throw err
    }
  }
}

function enforceWorkerAuthz(queueName, job) {
  const data = job?.data || {}
  const userId = data?.userId ? String(data.userId) : null
  const actorUserId = data?.actorUserId ? String(data.actorUserId) : userId
  const tenantId = effectiveTenantId(data?.tenantId || null)

  // Never do work without a target user.
  if (!userId) throw new Error('Forbidden')
  if (!actorUserId) throw new Error('Forbidden')

  // Enforce tenant membership for both actor and target.
  const db = getDb()
  if (!requireUserInTenant(db, { tenantId, userId })) {
    throw new Error('Tenant access denied')
  }
  if (!requireUserInTenant(db, { tenantId, userId: actorUserId })) {
    throw new Error('Tenant access denied')
  }

  // Current queues are student-owned pipelines. Prevent cross-user execution.
  const isStudentOwnedQueue =
    queueName === QUEUE_NAMES.resumeProcessing ||
    queueName === QUEUE_NAMES.resumeMatching ||
    queueName === QUEUE_NAMES.learningPlanGeneration ||
    queueName === QUEUE_NAMES.resumeRendering

  if (isStudentOwnedQueue && actorUserId !== userId) {
    throw new Error('Forbidden')
  }
}

function deriveJobContext(queueName, job) {
  const data = job?.data || {}
  const userId = data?.userId ? String(data.userId) : null
  const correlationId = data?.correlationId ? String(data.correlationId) : null
  const tenantId = data?.tenantId ? String(data.tenantId) : null

  if (!userId) return { userId: null }

  if (queueName === QUEUE_NAMES.resumeProcessing) {
    const resumeVersionId = data?.resumeVersionId ? String(data.resumeVersionId) : null
    const resumeVersion = data?.resumeVersion ? String(data.resumeVersion) : null
    return {
      userId,
      correlationId,
      tenantId,
      jobType: JOB_TYPES.RESUME_PARSING,
      scopeType: 'resume_version',
      scopeKey: resumeVersionId || resumeVersion || 'unknown',
      relatedEntityType: 'resume_version',
      relatedEntityId: resumeVersionId || null,
    }
  }

  if (queueName === QUEUE_NAMES.resumeMatching) {
    const tenantScope = tenantId || 'default'
    const resumeVersion = data?.resumeVersion ? String(data.resumeVersion) : 'unknown'
    const jobId = data?.jobId ? String(data.jobId) : 'unknown'
    return {
      userId,
      correlationId,
      tenantId,
      jobType: JOB_TYPES.RESUME_MATCHING,
      scopeType: 'match',
      scopeKey: `${tenantScope}:${resumeVersion}:${jobId}`,
      relatedEntityType: 'job',
      relatedEntityId: jobId,
    }
  }

  if (queueName === QUEUE_NAMES.learningPlanGeneration) {
    const tenantScope = tenantId || 'default'
    const resumeVersion = data?.resumeVersion ? String(data.resumeVersion) : 'unknown'
    const jobId = data?.jobId ? String(data.jobId) : 'unknown'
    return {
      userId,
      correlationId,
      tenantId,
      jobType: JOB_TYPES.LEARNING_PLAN,
      scopeType: 'learning_plan',
      scopeKey: `${tenantScope}:${resumeVersion}:${jobId}`,
      relatedEntityType: 'job',
      relatedEntityId: jobId,
    }
  }

  if (queueName === QUEUE_NAMES.resumeRendering) {
    const renderId = data?.renderId ? String(data.renderId) : 'unknown'
    return {
      userId,
      correlationId,
      tenantId,
      jobType: JOB_TYPES.RESUME_RENDERING,
      scopeType: 'render',
      scopeKey: renderId,
      relatedEntityType: 'resume_render',
      relatedEntityId: renderId,
    }
  }

  return { userId, correlationId }
}

function activityEventFor(queueName, { success }) {
  if (queueName === QUEUE_NAMES.resumeProcessing) {
    return success ? ACTIVITY_EVENT_TYPES.RESUME_PARSED : ACTIVITY_EVENT_TYPES.RESUME_PARSE_FAILED
  }
  if (queueName === QUEUE_NAMES.resumeMatching) {
    return success ? ACTIVITY_EVENT_TYPES.RESUME_MATCH_UPDATED : ACTIVITY_EVENT_TYPES.RESUME_MATCH_FAILED
  }
  if (queueName === QUEUE_NAMES.learningPlanGeneration) {
    return success ? ACTIVITY_EVENT_TYPES.LEARNING_PLAN_GENERATED : ACTIVITY_EVENT_TYPES.LEARNING_PLAN_FAILED
  }
  if (queueName === QUEUE_NAMES.resumeRendering) {
    return success ? ACTIVITY_EVENT_TYPES.RESUME_REGENERATED : ACTIVITY_EVENT_TYPES.RESUME_RENDER_FAILED
  }
  return null
}

const workers = {
  resumeProcessing: new Worker(
    QUEUE_NAMES.resumeProcessing,
    withDlq({ queueName: QUEUE_NAMES.resumeProcessing, processor: processResume }),
    { connection, concurrency: concurrency.resumeProcessing }
  ),
  resumeMatching: new Worker(
    QUEUE_NAMES.resumeMatching,
    withDlq({ queueName: QUEUE_NAMES.resumeMatching, processor: processMatch }),
    { connection, concurrency: concurrency.resumeMatching }
  ),
  learningPlanGeneration: new Worker(
    QUEUE_NAMES.learningPlanGeneration,
    withDlq({ queueName: QUEUE_NAMES.learningPlanGeneration, processor: processLearningPlan }),
    { connection, concurrency: concurrency.learningPlan }
  ),
  resumeRendering: new Worker(
    QUEUE_NAMES.resumeRendering,
    withDlq({ queueName: QUEUE_NAMES.resumeRendering, processor: processRender }),
    { connection, concurrency: concurrency.resumeRendering }
  ),
}

for (const [name, w] of Object.entries(workers)) {
  w.on('completed', (job, result) => {
    if (result && typeof result === 'object' && result._skipJobStatus) {
      logger.info({ queue: name, jobId: job.id, name: job.name, result }, '[worker] job skipped')
      return
    }

    const derived = deriveJobContext(QUEUE_NAMES[name] || name, job)
    if (derived?.userId && derived?.scopeType && derived?.scopeKey && derived?.jobType) {
      recordJobCompleted({
        userId: derived.userId,
        tenantId: derived.tenantId || null,
        jobType: derived.jobType,
        scopeType: derived.scopeType,
        scopeKey: derived.scopeKey,
        attemptsMade: job?.attemptsMade,
        correlationId: derived.correlationId,
      })

      const evt = activityEventFor(QUEUE_NAMES[name] || name, { success: true })
      if (evt) {
        try {
          const meta = {
            scopeType: derived.scopeType,
            scopeKey: derived.scopeKey,
          }

          if (derived.jobType === JOB_TYPES.RESUME_MATCHING && result && typeof result === 'object') {
            if (result.score !== undefined) meta.score = result.score
            if (job?.data?.jobId) meta.jobId = String(job.data.jobId)
          }

          if (derived.jobType === JOB_TYPES.LEARNING_PLAN && result && typeof result === 'object') {
            if (result.planId !== undefined) meta.planId = result.planId
            if (job?.data?.jobId) meta.jobId = String(job.data.jobId)
          }

          emitActivityEvent({
            tenantId: derived.tenantId || null,
            userId: derived.userId,
            type: evt,
            source: 'WORKER',
            status: 'SUCCESS',
            relatedEntityType: derived.relatedEntityType,
            relatedEntityId: derived.relatedEntityId,
            jobType: derived.jobType,
            bullmqJobId: String(job?.id || ''),
            correlationId: derived.correlationId,
            metadata: meta,
            notify: 'auto',
          })
        } catch {
          // ignore
        }
      }
    }

    logger.info({ queue: name, jobId: job.id, name: job.name }, '[worker] job completed')
  })
  w.on('failed', (job, err) => {
    logger.warn({ queue: name, jobId: job?.id, name: job?.name, err }, '[worker] job failed')
  })
}

logger.info(
  {
    concurrency,
    queues: Object.values(QUEUE_NAMES),
  },
  '[worker] started'
)

let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.warn({ signal }, '[worker] shutdown starting')

  const forceTimeout = setTimeout(() => {
    logger.fatal('[worker] forced exit after timeout')
    process.exit(1)
  }, 12_000)
  forceTimeout.unref?.()

  try {
    await Promise.allSettled(Object.values(workers).map((w) => w.close()))
  } catch (err) {
    logger.error({ err }, '[worker] closing workers failed')
  }

  try {
    await closeQueues()
  } catch (err) {
    logger.error({ err }, '[worker] closing queues failed')
  }

  try {
    await closeRedisConnection()
  } catch (err) {
    logger.error({ err }, '[worker] closing redis failed')
  }

  try {
    closeDb()
  } catch (err) {
    logger.error({ err }, '[worker] closing sqlite failed')
  }

  try {
    await closePgPools()
  } catch (err) {
    logger.error({ err }, '[worker] closing pg pools failed')
  }

  clearTimeout(forceTimeout)
  logger.info('[worker] shutdown complete')
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
