import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getDb } from '../lib/db.js'
import { effectiveTenantId, getTenantIdFromRequest } from '../lib/tenancy.js'
import { apiSuccess, apiUnauthorized } from '../lib/apiResponse.js'

const router = express.Router()

function nowIso() {
  return new Date().toISOString()
}

function exportUserData(db, { tenantId, userId }) {
  const user = db
    .prepare('SELECT id, email, name, provider, created_at, updated_at, status, deleted_at FROM users WHERE id = ?')
    .get(userId)

  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId)
  const academicsMeta = db.prepare('SELECT * FROM academics_meta WHERE user_id = ?').get(userId)
  const academicsSubjects = db
    .prepare('SELECT * FROM academics_subjects WHERE user_id = ? ORDER BY updated_at DESC, subject ASC')
    .all(userId)
  const assignments = db.prepare('SELECT * FROM assignments WHERE user_id = ? ORDER BY due_date ASC, id DESC').all(userId)
  const exams = db.prepare('SELECT * FROM exams WHERE user_id = ? ORDER BY date ASC, id DESC').all(userId)

  const resumeDocument = db.prepare('SELECT * FROM resume_documents WHERE user_id = ?').get(userId)
  const resumeVersions = resumeDocument
    ? db
        .prepare('SELECT * FROM resume_versions WHERE resume_document_id = ? ORDER BY version DESC')
        .all(resumeDocument.id)
    : []

  const resumeParsedSnapshots = resumeDocument
    ? db
        .prepare(
          `SELECT rps.*
           FROM resume_parsed_snapshots rps
           JOIN resume_versions rv ON rv.id = rps.resume_version_id
           WHERE rv.resume_document_id = ?
           ORDER BY rps.id DESC`
        )
        .all(resumeDocument.id)
    : []

  const resumeTargets = db
    .prepare('SELECT * FROM resume_targets WHERE user_id = ? AND tenant_id IS ? ORDER BY updated_at DESC')
    .all(userId, tenantId)

  const resumeJobMatches = db
    .prepare('SELECT * FROM resume_job_matches WHERE user_id = ? AND tenant_id IS ? ORDER BY updated_at DESC')
    .all(userId, tenantId)

  const learningPlans = db
    .prepare('SELECT * FROM learning_plans WHERE user_id = ? AND tenant_id IS ? ORDER BY created_at DESC')
    .all(userId, tenantId)

  const learningPlanItems = learningPlans.length
    ? db
        .prepare(
          `SELECT lpi.*
           FROM learning_plan_items lpi
           JOIN learning_plans lp ON lp.id = lpi.learning_plan_id
           WHERE lp.user_id = ? AND lp.tenant_id IS ?
           ORDER BY lpi.updated_at DESC, lpi.id DESC`
        )
        .all(userId, tenantId)
    : []

  const resumeRenders = db
    .prepare('SELECT * FROM resume_renders WHERE user_id = ? AND tenant_id IS ? ORDER BY created_at DESC')
    .all(userId, tenantId)

  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? AND tenant_id IS ? ORDER BY created_at DESC')
    .all(userId, tenantId)

  const activityEvents = db
    .prepare('SELECT * FROM activity_events WHERE user_id = ? AND tenant_id IS ? ORDER BY created_at DESC')
    .all(userId, tenantId)

  return {
    exportedAt: nowIso(),
    tenantId,
    user,
    data: {
      profile,
      academicsMeta,
      academicsSubjects,
      assignments,
      exams,
      resume: {
        resumeDocument,
        resumeVersions,
        resumeParsedSnapshots,
        resumeTargets,
        resumeJobMatches,
        resumeRenders,
      },
      learning: {
        learningPlans,
        learningPlanItems,
      },
      notifications,
      activityEvents,
    },
  }
}

// GET /api/account/me/export
router.get('/me/export', authMiddleware, (req, res) => {
  const db = getDb()
  const tenantId = effectiveTenantId(getTenantIdFromRequest(req))
  const userId = req.user?.id

  if (!userId) return apiUnauthorized(res)

  const payload = exportUserData(db, { tenantId, userId })
  return apiSuccess(res, payload)
})

// DELETE /api/account/me
router.delete('/me', authMiddleware, async (req, res) => {
  const db = getDb()
  const tenantId = effectiveTenantId(getTenantIdFromRequest(req))
  const userId = req.user?.id

  if (!userId) return apiUnauthorized(res)

  const existing = db
    .prepare(
      'SELECT tenant_id, user_id, status, requested_at, soft_deleted_at, purge_after FROM account_deletions WHERE tenant_id IS ? AND user_id = ?'
    )
    .get(tenantId, userId)

  const requestedAt = nowIso()
  const softDeletedAt = requestedAt
  const retentionDays = Number.parseInt(process.env.ACCOUNT_PURGE_AFTER_DAYS || '30', 10)
  const purgeAfter = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString()

  if (existing && (existing.status === 'SOFT_DELETED' || existing.status === 'PURGED')) {
    return apiSuccess(res, { ok: true, tenantId, userId, deletion: existing, note: 'Already deleted' })
  }

  db.prepare('BEGIN').run()
  try {
    db.prepare('UPDATE users SET status = ?, deleted_at = ? WHERE id = ?').run('DELETED', softDeletedAt, userId)

    if (existing) {
      db.prepare(
        'UPDATE account_deletions SET status = ?, soft_deleted_at = ?, purge_after = ? WHERE tenant_id IS ? AND user_id = ?'
      ).run('SOFT_DELETED', softDeletedAt, purgeAfter, tenantId, userId)
    } else {
      db.prepare(
        'INSERT INTO account_deletions (tenant_id, user_id, status, requested_at, soft_deleted_at, purge_after) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(tenantId, userId, 'SOFT_DELETED', requestedAt, softDeletedAt, purgeAfter)
    }

    // Revoke all refresh tokens for this user.
    try {
      db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId)
    } catch {
      // ignore
    }

    db.prepare('COMMIT').run()
  } catch (err) {
    db.prepare('ROLLBACK').run()
    throw err
  }

  const deletion = db
    .prepare(
      'SELECT tenant_id, user_id, status, requested_at, soft_deleted_at, purge_after FROM account_deletions WHERE tenant_id IS ? AND user_id = ?'
    )
    .get(tenantId, userId)

  return apiSuccess(res, { ok: true, tenantId, userId, deletion })
})

export default router
