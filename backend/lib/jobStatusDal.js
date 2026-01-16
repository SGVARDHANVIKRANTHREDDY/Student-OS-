import { getDb } from './db.js'

function nowIso() {
  return new Date().toISOString()
}

export function upsertJobStatusSnapshot(db, {
  userId,
  tenantId = null,
  jobType,
  scopeType,
  scopeKey,
  queueName = null,
  jobName = null,
  bullmqJobId = null,
  correlationId = null,
  status,
  attemptsMade = 0,
  maxAttempts = null,
  lastErrorPublic = null,
  lastErrorCode = null,
  payload = null,
  enqueuedAt = null,
  startedAt = null,
  finishedAt = null,
}) {
  const updatedAt = nowIso()

  db
    .prepare(
      `INSERT INTO job_status_snapshots
        (user_id, tenant_id, job_type, scope_type, scope_key, queue_name, job_name, bullmq_job_id, correlation_id,
         status, attempts_made, max_attempts, last_error_public, last_error_code, payload_json,
         enqueued_at, started_at, finished_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, job_type, scope_type, scope_key)
       DO UPDATE SET
         tenant_id = COALESCE(excluded.tenant_id, tenant_id),
         queue_name = COALESCE(excluded.queue_name, queue_name),
         job_name = COALESCE(excluded.job_name, job_name),
         bullmq_job_id = COALESCE(excluded.bullmq_job_id, bullmq_job_id),
         correlation_id = COALESCE(excluded.correlation_id, correlation_id),
         status = excluded.status,
         attempts_made = excluded.attempts_made,
         max_attempts = COALESCE(excluded.max_attempts, max_attempts),
         last_error_public = excluded.last_error_public,
         last_error_code = excluded.last_error_code,
         payload_json = COALESCE(excluded.payload_json, payload_json),
         enqueued_at = COALESCE(excluded.enqueued_at, enqueued_at),
         started_at = COALESCE(excluded.started_at, started_at),
         finished_at = COALESCE(excluded.finished_at, finished_at),
         updated_at = excluded.updated_at`
    )
    .run(
      String(userId),
      tenantId ? String(tenantId) : null,
      String(jobType),
      String(scopeType),
      String(scopeKey),
      queueName ? String(queueName) : null,
      jobName ? String(jobName) : null,
      bullmqJobId ? String(bullmqJobId) : null,
      correlationId ? String(correlationId) : null,
      String(status),
      Number(attemptsMade || 0),
      maxAttempts === null || maxAttempts === undefined ? null : Number(maxAttempts),
      lastErrorPublic ? String(lastErrorPublic) : null,
      lastErrorCode ? String(lastErrorCode) : null,
      payload ? JSON.stringify(payload) : null,
      enqueuedAt ? String(enqueuedAt) : null,
      startedAt ? String(startedAt) : null,
      finishedAt ? String(finishedAt) : null,
      updatedAt
    )
}

export function recordJobQueued({
  userId,
  tenantId = null,
  jobType,
  scopeType,
  scopeKey,
  queueName,
  jobName,
  bullmqJobId,
  correlationId,
  payload,
  maxAttempts,
}) {
  const db = getDb()
  upsertJobStatusSnapshot(db, {
    userId,
    tenantId: tenantId ?? payload?.tenantId ?? null,
    jobType,
    scopeType,
    scopeKey,
    queueName,
    jobName,
    bullmqJobId,
    correlationId,
    status: 'QUEUED',
    attemptsMade: 0,
    maxAttempts: maxAttempts ?? null,
    payload,
    enqueuedAt: nowIso(),
  })
}

export function recordJobRunning({ userId, tenantId = null, jobType, scopeType, scopeKey, attemptsMade, correlationId }) {
  const db = getDb()
  upsertJobStatusSnapshot(db, {
    userId,
    tenantId,
    jobType,
    scopeType,
    scopeKey,
    correlationId,
    status: 'RUNNING',
    attemptsMade: Number(attemptsMade || 0),
    startedAt: nowIso(),
    lastErrorPublic: null,
    lastErrorCode: null,
  })
}

export function recordJobCompleted({ userId, tenantId = null, jobType, scopeType, scopeKey, attemptsMade, correlationId }) {
  const db = getDb()
  upsertJobStatusSnapshot(db, {
    userId,
    tenantId,
    jobType,
    scopeType,
    scopeKey,
    correlationId,
    status: 'COMPLETED',
    attemptsMade: Number(attemptsMade || 0),
    finishedAt: nowIso(),
    lastErrorPublic: null,
    lastErrorCode: null,
  })
}

export function recordJobFailed({
  userId,
  tenantId = null,
  jobType,
  scopeType,
  scopeKey,
  attemptsMade,
  correlationId,
  errorPublic,
  errorCode = null,
}) {
  const db = getDb()
  upsertJobStatusSnapshot(db, {
    userId,
    tenantId,
    jobType,
    scopeType,
    scopeKey,
    correlationId,
    status: 'FAILED',
    attemptsMade: Number(attemptsMade || 0),
    finishedAt: nowIso(),
    lastErrorPublic: errorPublic ? String(errorPublic) : 'Job failed. Please retry.',
    lastErrorCode: errorCode ? String(errorCode) : null,
  })
}

export function listLatestJobStatuses(db, userId, { limit = 50, jobType = null } = {}) {
  const effectiveLimit = Math.max(1, Math.min(200, Number(limit || 50)))

  if (jobType) {
    return db
      .prepare(
        `SELECT *
         FROM job_status_snapshots
         WHERE user_id = ? AND job_type = ?
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(userId, String(jobType), effectiveLimit)
  }

  return db
    .prepare(
      `SELECT *
       FROM job_status_snapshots
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(userId, effectiveLimit)
}

export function getJobStatusSnapshotById(db, { userId, id }) {
  return db
    .prepare(
      `SELECT *
       FROM job_status_snapshots
       WHERE id = ? AND user_id = ?
       LIMIT 1`
    )
    .get(Number(id), String(userId))
}
