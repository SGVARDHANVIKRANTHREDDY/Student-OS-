import { Queue, QueueEvents } from 'bullmq'
import { getRedisConnection, isRedisConfigured } from './redis.js'
import { getDb } from './db.js'
import { getEntitlement } from './billing.js'
import { effectiveTenantId } from './tenancy.js'

export const QUEUE_NAMES = {
  resumeProcessing: 'resume_processing',
  resumeMatching: 'resume_matching',
  learningPlanGeneration: 'learning_plan_generation',
  // Reserved for Module 3 (LaTeX render pipeline).
  resumeRendering: 'resume_rendering',
  deadLetter: 'dead_letter',
}

let queues
let queueEvents

function getConnectionOrThrow() {
  const conn = getRedisConnection()
  if (!conn) {
    throw new Error('Redis not configured. Set REDIS_URL or REDIS_HOST/REDIS_PORT.')
  }
  return conn
}

function buildQueueDefaults() {
  // Keep failures for ops debugging; cap completed history.
  const removeOnCompleteCount = Number(process.env.BULLMQ_REMOVE_ON_COMPLETE || 500)
  const removeOnFail = process.env.BULLMQ_REMOVE_ON_FAIL
    ? process.env.BULLMQ_REMOVE_ON_FAIL.toLowerCase() === 'true'
    : false

  return {
    defaultJobOptions: {
      attempts: Number(process.env.BULLMQ_ATTEMPTS || 5),
      backoff: {
        type: 'exponential',
        delay: Number(process.env.BULLMQ_BACKOFF_MS || 5_000),
      },
      removeOnComplete: removeOnCompleteCount,
      removeOnFail,
    },
  }
}

export function isQueueingAvailable() {
  return isRedisConfigured()
}

export function getQueues() {
  if (queues) return queues

  const connection = getConnectionOrThrow()
  const defaults = buildQueueDefaults()

  queues = {
    resumeProcessing: new Queue(QUEUE_NAMES.resumeProcessing, { connection, ...defaults }),
    resumeMatching: new Queue(QUEUE_NAMES.resumeMatching, { connection, ...defaults }),
    learningPlanGeneration: new Queue(QUEUE_NAMES.learningPlanGeneration, { connection, ...defaults }),
    resumeRendering: new Queue(QUEUE_NAMES.resumeRendering, { connection, ...defaults }),
    deadLetter: new Queue(QUEUE_NAMES.deadLetter, { connection, ...defaults }),
  }

  return queues
}

export async function checkTenantQuota({ tenantId, featureKey, windowSec = 60, defaultMax = null } = {}) {
  const tid = effectiveTenantId(tenantId)
  const fk = String(featureKey || '').trim()
  const ws = Math.max(1, Math.trunc(Number(windowSec || 60)))

  if (!fk) return { ok: true }
  if (!isRedisConfigured()) return { ok: true }

  const redis = getRedisConnection()
  if (!redis) return { ok: true }

  const db = getDb()
  const ent = getEntitlement(db, { tenantId: tid, featureKey: fk })
  if (!ent.enabled) {
    return { ok: false, code: 'FEATURE_DISABLED', message: 'This feature is not enabled for your plan.' }
  }

  const limit = ent.limit === null || ent.limit === undefined ? defaultMax : ent.limit
  if (limit === null || limit === undefined) return { ok: true, limit: null, used: null }

  const key = `quota:${fk}:t:${tid}`

  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, ws)
  }

  if (count > Number(limit)) {
    return {
      ok: false,
      code: 'TENANT_QUOTA',
      message: "You've reached your tenant quota. Please try again later.",
      limit: Number(limit),
      used: Number(count),
      retryAfterSec: ws,
    }
  }

  const warnAt = Number(process.env.QUOTA_WARN_AT || 0.8)
  const warning = Number.isFinite(warnAt) && warnAt > 0 && warnAt < 1 && count / Number(limit) >= warnAt
    ? `Approaching tenant quota for ${fk}.`
    : null

  return { ok: true, limit: Number(limit), used: Number(count), retryAfterSec: ws, warning }
}

export async function enqueueWithTenantQuota(queue, { jobName, payload, jobId, tenantId, featureKey, windowSec = 60, defaultMax = null } = {}) {
  const check = await checkTenantQuota({ tenantId, featureKey, windowSec, defaultMax })
  if (!check.ok) return check

  const job = await queue.add(jobName, payload, jobId ? { jobId } : undefined)
  return { ok: true, job, warning: check.warning || null, quota: { featureKey, limit: check.limit ?? null, used: check.used ?? null } }
}

export function getQueueEvents() {
  if (queueEvents) return queueEvents

  const connection = getConnectionOrThrow()
  queueEvents = {
    resumeProcessing: new QueueEvents(QUEUE_NAMES.resumeProcessing, { connection }),
    resumeMatching: new QueueEvents(QUEUE_NAMES.resumeMatching, { connection }),
    learningPlanGeneration: new QueueEvents(QUEUE_NAMES.learningPlanGeneration, { connection }),
    resumeRendering: new QueueEvents(QUEUE_NAMES.resumeRendering, { connection }),
    deadLetter: new QueueEvents(QUEUE_NAMES.deadLetter, { connection }),
  }

  return queueEvents
}

export async function closeQueues() {
  if (queueEvents) {
    const evs = queueEvents
    queueEvents = undefined
    await Promise.allSettled(Object.values(evs).map((q) => q.close()))
  }

  if (queues) {
    const qs = queues
    queues = undefined
    await Promise.allSettled(Object.values(qs).map((q) => q.close()))
  }
}
