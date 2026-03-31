import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getDb } from '../lib/db.js'
import { getTenantIdFromRequest } from '../lib/tenancy.js'
import { hasPermission } from '../lib/rbac.js'
import { requireUserInTenant } from '../lib/tenantScope.js'
import { validate } from '../lib/validate.js'
import { subjectBody, attendanceBody, attendanceRecordBody, careerGoalBody, userIdParam } from '../lib/schemas.js'
import { apiSuccess, apiForbidden, apiError } from '../lib/apiResponse.js'

const router = express.Router()

function canReadAcademics(req, requestedUserId) {
  if (String(req.user?.id || '') === String(requestedUserId || '')) return true
  return hasPermission(req.auth, 'platform:admin') || hasPermission(req.auth, 'academics:read:any')
}

function canWriteAcademics(req) {
  return hasPermission(req.auth, 'platform:admin') || hasPermission(req.auth, 'academics:write')
}

function ensureMeta(db, { tenantId, userId }) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT OR IGNORE INTO academics_meta (tenant_id, user_id, updated_at) VALUES (?, ?, ?)`
  ).run(tenantId, userId, now)
}

function computeCgpaFromScores(scores) {
  const list = Array.isArray(scores) ? scores : []
  if (list.length === 0) return null
  const avg = list.reduce((s, n) => s + Number(n || 0), 0) / list.length
  // Simple deterministic mapping: 0-100 -> 0.0-10.0
  const cgpa = Math.max(0, Math.min(10, avg / 10))
  return Math.round(cgpa * 100) / 100
}

function getAttendanceSummary(db, { tenantId, userId, legacyAttendance }) {
  const rows = db
    .prepare(
      `SELECT status
       FROM attendance_records
       WHERE tenant_id = ? AND user_id = ?`
    )
    .all(tenantId, userId)

  if (!rows || rows.length === 0) {
    const v = Number(legacyAttendance)
    const pct = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.trunc(v))) : 0
    return { percent: pct, presentDays: null, totalDays: null, source: 'legacy' }
  }

  const total = rows.length
  const present = rows.filter((r) => String(r.status).toUpperCase() === 'PRESENT').length
  const percent = total === 0 ? 0 : Math.round((present / total) * 100)
  return { percent, presentDays: present, totalDays: total, source: 'daily' }
}

function getSnapshot(db, { tenantId, userId }) {
  ensureMeta(db, { tenantId, userId })

  const meta = db
    .prepare(`SELECT attendance, career_goal FROM academics_meta WHERE tenant_id = ? AND user_id = ?`)
    .get(tenantId, userId)

  const subjects = db
    .prepare(
      `SELECT subject, score, grade
       FROM academics_subjects
       WHERE tenant_id = ? AND user_id = ?
       ORDER BY updated_at DESC, subject ASC`
    )
    .all(tenantId, userId)

  const scores = subjects.map((r) => Number(r.score)).filter((n) => Number.isFinite(n))
  const averageScore = scores.length ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 100) / 100 : null
  const cgpa = computeCgpaFromScores(scores)

  const attendance = getAttendanceSummary(db, {
    tenantId,
    userId,
    legacyAttendance: meta?.attendance ?? 0,
  })

  return {
    subjects: subjects.map((row) => ({
      subject: row.subject,
      score: row.score,
      grade: row.grade,
    })),
    attendancePercent: attendance.percent,
    attendance,
    careerGoal: meta?.career_goal ?? '',
    computed: {
      averageScore,
      cgpa,
      subjectsCount: subjects.length,
    },
  }
}

router.post('/:userId/academics', authMiddleware, validate({ params: userIdParam, body: subjectBody }), (req, res) => {
  const { userId } = req.params
  if (!canWriteAcademics(req)) return apiForbidden(res)
  const { subject, score, grade } = req.body

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return apiForbidden(res)
  ensureMeta(db, { tenantId, userId })

  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO academics_subjects (tenant_id, user_id, subject, score, grade, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, subject) DO UPDATE SET
       score = excluded.score,
       grade = excluded.grade,
       updated_at = excluded.updated_at`
  ).run(tenantId, userId, subject, score, grade, req.user?.id || null, now, now)

  return apiSuccess(res, getSnapshot(db, { tenantId, userId }))
})

router.get('/:userId/academics', authMiddleware, validate({ params: userIdParam }), (req, res) => {
  const { userId } = req.params
  if (!canReadAcademics(req, userId)) return apiForbidden(res)
  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return apiForbidden(res)
  return apiSuccess(res, getSnapshot(db, { tenantId, userId }))
})

router.post('/:userId/attendance', authMiddleware, validate({ params: userIdParam, body: attendanceBody }), (req, res) => {
  const { userId } = req.params
  if (!canWriteAcademics(req)) return apiForbidden(res)
  const { attendance } = req.body

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return apiForbidden(res)
  ensureMeta(db, { tenantId, userId })
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE academics_meta SET attendance = ?, updated_at = ? WHERE tenant_id = ? AND user_id = ?`
  ).run(Math.round(attendance), now, tenantId, userId)

  return apiSuccess(res, getSnapshot(db, { tenantId, userId }))
})

// Admin-only: daily attendance
router.post('/:userId/attendance/record', authMiddleware, validate({ params: userIdParam, body: attendanceRecordBody }), (req, res) => {
  const { userId } = req.params
  if (!canWriteAcademics(req)) return apiForbidden(res)

  const { day, status } = req.body

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return apiForbidden(res)

  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO attendance_records (tenant_id, user_id, day, status, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, user_id, day) DO UPDATE SET
       status = excluded.status,
       updated_at = excluded.updated_at,
       created_by_user_id = excluded.created_by_user_id`
  ).run(tenantId, userId, day, status, req.user?.id || null, now, now)

  return apiSuccess(res, getSnapshot(db, { tenantId, userId }))
})

router.post('/:userId/career-goal', authMiddleware, validate({ params: userIdParam, body: careerGoalBody }), (req, res) => {
  const { userId } = req.params
  const isSelf = String(req.user?.id || '') === String(userId || '')
  if (!isSelf && !canWriteAcademics(req)) return apiForbidden(res)
  const { goal } = req.body

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return apiForbidden(res)
  ensureMeta(db, { tenantId, userId })
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE academics_meta SET career_goal = ?, updated_at = ? WHERE tenant_id = ? AND user_id = ?`
  ).run(goal, now, tenantId, userId)

  return apiSuccess(res, getSnapshot(db, { tenantId, userId }))
})

export default router
