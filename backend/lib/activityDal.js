import { getDb } from './db.js'
import { NOTIFICATION_DELIVERY_TYPES, ACTIVITY_EVENT_TYPES } from './activityTypes.js'

function nowIso() {
  return new Date().toISOString()
}

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value || '')
    return parsed === null || parsed === undefined ? fallback : parsed
  } catch {
    return fallback
  }
}

function defaultNotificationForEvent({ type, metadata }) {
  switch (type) {
    case ACTIVITY_EVENT_TYPES.RESUME_PARSED:
      return { title: 'Resume parsed successfully', body: 'Your resume was parsed successfully.' }
    case ACTIVITY_EVENT_TYPES.RESUME_PARSE_FAILED:
      return { title: 'Resume parsing failed', body: String(metadata?.reason || 'Resume parsing failed. Please retry.') }
    case ACTIVITY_EVENT_TYPES.RESUME_MATCH_UPDATED:
      return {
        title: 'Resume match updated',
        body: metadata?.jobId ? `Match score updated for job ${metadata.jobId}.` : 'Your resume match score was updated.',
      }
    case ACTIVITY_EVENT_TYPES.RESUME_MATCH_FAILED:
      return { title: 'Resume matching failed', body: String(metadata?.reason || 'Resume matching failed. Please retry.') }
    case ACTIVITY_EVENT_TYPES.LEARNING_PLAN_GENERATED:
      return { title: 'New learning plan generated', body: 'A new learning plan was generated for your target job.' }
    case ACTIVITY_EVENT_TYPES.LEARNING_PLAN_FAILED:
      return { title: 'Learning plan generation failed', body: String(metadata?.reason || 'Learning plan generation failed.') }
    case ACTIVITY_EVENT_TYPES.RESUME_OUTDATED:
      return { title: 'Resume may be outdated', body: 'Your resume may be outdated for a target job. Consider re-running matching.' }
    case ACTIVITY_EVENT_TYPES.RESUME_REGENERATED:
      return { title: 'Resume regenerated', body: 'Your resume PDF is ready to download.' }
    case ACTIVITY_EVENT_TYPES.RESUME_RENDER_FAILED:
      return { title: 'Resume regeneration failed', body: String(metadata?.reason || 'Resume regeneration failed. Please retry.') }
    case ACTIVITY_EVENT_TYPES.JOB_APPLIED:
      return {
        title: 'Application submitted',
        body: metadata?.jobId ? `You applied to job ${metadata.jobId}.` : 'Your job application was submitted.',
      }
    case ACTIVITY_EVENT_TYPES.APPLICATION_STATUS_CHANGED:
      return {
        title: 'Application status updated',
        body: metadata?.jobTitle
          ? `Your application for ${metadata.jobTitle} is now ${metadata?.toStatus || 'updated'}.`
          : `Your application status is now ${metadata?.toStatus || 'updated'}.`,
      }
    case ACTIVITY_EVENT_TYPES.JOB_LIFECYCLE_CHANGED:
      return {
        title: 'Job lifecycle updated',
        body: metadata?.jobTitle
          ? `${metadata.jobTitle} is now ${metadata?.toStatus || 'updated'}.`
          : `Job status changed to ${metadata?.toStatus || 'updated'}.`,
      }
    case ACTIVITY_EVENT_TYPES.JOB_DEADLINE_CHANGED:
      return {
        title: 'Job deadline updated',
        body: metadata?.jobTitle
          ? `Deadline updated for ${metadata.jobTitle}.`
          : 'Job deadline updated.',
      }
    default:
      return null
  }
}

export function emitActivityEvent({
  tenantId = null,
  userId,
  type,
  source,
  status = null,
  relatedEntityType = null,
  relatedEntityId = null,
  jobType = null,
  bullmqJobId = null,
  correlationId = null,
  metadata = {},
  notify = 'auto',
  db = null,
}) {
  const effectiveDb = db || getDb()
  const createdAt = nowIso()

  const ins = effectiveDb
    .prepare(
      `INSERT INTO activity_events
        (tenant_id, user_id, event_type, source, status, related_entity_type, related_entity_id, job_type, bullmq_job_id, correlation_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      tenantId ? String(tenantId) : null,
      String(userId),
      String(type),
      String(source),
      status ? String(status) : null,
      relatedEntityType ? String(relatedEntityType) : null,
      relatedEntityId ? String(relatedEntityId) : null,
      jobType ? String(jobType) : null,
      bullmqJobId ? String(bullmqJobId) : null,
      correlationId ? String(correlationId) : null,
      JSON.stringify(metadata || {}),
      createdAt
    )

  const eventId = ins.lastInsertRowid

  let shouldNotify = false
  let notification = null

  if (notify === true) {
    shouldNotify = true
  } else if (notify === false) {
    shouldNotify = false
  } else {
    notification = defaultNotificationForEvent({ type, metadata })
    shouldNotify = Boolean(notification)
  }

  if (shouldNotify) {
    const n = notification || { title: 'Update', body: 'You have a new update.' }
    effectiveDb
      .prepare(
        `INSERT INTO notifications
          (tenant_id, user_id, activity_event_id, delivery_type, title, body, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
      )
      .run(
        tenantId ? String(tenantId) : null,
        String(userId),
        Number(eventId),
        NOTIFICATION_DELIVERY_TYPES.IN_APP,
        String(n.title),
        String(n.body),
        createdAt
      )
  }

  return { eventId }
}

export function listActivityEvents(db, userId, { tenantId = null, limit = 50, beforeId = null, types = null } = {}) {
  const effectiveLimit = Math.max(1, Math.min(200, Number(limit || 50)))

  const typeList = Array.isArray(types) ? types.map((t) => String(t).trim()).filter(Boolean) : []

  if (typeList.length > 0) {
    const placeholders = typeList.map(() => '?').join(',')
    const params = [String(userId), tenantId ? String(tenantId) : null, ...typeList]

    let sql = `SELECT * FROM activity_events WHERE user_id = ? AND tenant_id IS ? AND event_type IN (${placeholders})`
    if (beforeId) {
      sql += ' AND id < ?'
      params.push(Number(beforeId))
    }
    sql += ' ORDER BY id DESC LIMIT ?'
    params.push(effectiveLimit)

    return db.prepare(sql).all(...params)
  }

  if (beforeId) {
    return db
      .prepare(
        `SELECT *
         FROM activity_events
         WHERE user_id = ? AND tenant_id IS ? AND id < ?
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(String(userId), tenantId ? String(tenantId) : null, Number(beforeId), effectiveLimit)
  }

  return db
    .prepare(
      `SELECT *
       FROM activity_events
       WHERE user_id = ? AND tenant_id IS ?
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(String(userId), tenantId ? String(tenantId) : null, effectiveLimit)
}

export function normalizeActivityRow(row) {
  if (!row) return null
  return {
    id: row.id,
    type: row.event_type,
    source: row.source,
    status: row.status || null,
    relatedEntity: row.related_entity_type
      ? { type: row.related_entity_type, id: row.related_entity_id || null }
      : null,
    job: row.job_type ? { type: row.job_type, bullmqJobId: row.bullmq_job_id || null } : null,
    correlationId: row.correlation_id || null,
    metadata: safeJsonParse(row.metadata_json, {}),
    createdAt: row.created_at,
  }
}
