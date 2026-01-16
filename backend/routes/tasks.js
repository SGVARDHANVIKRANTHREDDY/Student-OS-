import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getDb } from '../lib/db.js'
import { getTenantIdFromRequest } from '../lib/tenancy.js'
import { hasPermission } from '../lib/rbac.js'
import { requireUserInTenant } from '../lib/tenantScope.js'

const router = express.Router()

function canReadTasks(req, requestedUserId) {
  if (String(req.user?.id || '') === String(requestedUserId || '')) return true
  return hasPermission(req.auth, 'platform:admin') || hasPermission(req.auth, 'tasks:read:any')
}

function canAssignTasks(req) {
  return hasPermission(req.auth, 'platform:admin') || hasPermission(req.auth, 'tasks:assign')
}

function canReadTaskStats(req) {
  return hasPermission(req.auth, 'platform:admin') || hasPermission(req.auth, 'tasks:stats')
}

function rowToAssignment(row) {
  if (!row) return null
  return {
    id: String(row.id),
    title: row.title,
    description: row.description ?? '',
    dueDate: row.due_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToExam(row) {
  if (!row) return null
  return {
    id: String(row.id),
    subject: row.subject,
    date: row.date,
    time: row.time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

router.post('/:userId/assignments', authMiddleware, (req, res) => {
  const { userId } = req.params
  if (!canAssignTasks(req)) return res.status(403).json({ message: 'Forbidden' })
  const { title, dueDate, status, description } = req.body

  if (!title || !dueDate) {
    return res.status(400).json({ message: 'Title and due date required' })
  }

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })
  const now = new Date().toISOString()
  const normalizedTitle = String(title).trim()
  const normalizedDueDate = String(dueDate).trim()
  const normalizedStatus = String(status || 'pending').trim() || 'pending'
  const normalizedDescription = String(description || '').trim()

  const info = db
    .prepare(
      `INSERT INTO assignments (tenant_id, user_id, title, description, due_date, status, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(tenantId, userId, normalizedTitle, normalizedDescription, normalizedDueDate, normalizedStatus, req.user?.id || null, now, now)

  const row = db
    .prepare(`SELECT * FROM assignments WHERE id = ? AND tenant_id = ? AND user_id = ?`)
    .get(info.lastInsertRowid, tenantId, userId)
  return res.status(201).json(rowToAssignment(row))
})

router.get('/:userId/assignments', authMiddleware, (req, res) => {
  const { userId } = req.params
  if (!canReadTasks(req, userId)) return res.status(403).json({ message: 'Forbidden' })
  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })
  const rows = db
    .prepare(`SELECT * FROM assignments WHERE tenant_id = ? AND user_id = ? ORDER BY due_date ASC, id DESC`)
    .all(tenantId, userId)
  return res.json(rows.map(rowToAssignment))
})

router.put('/:userId/assignments/:id', authMiddleware, (req, res) => {
  const { userId, id } = req.params
  const isSelf = String(req.user?.id || '') === String(userId || '')
  if (!isSelf && !canAssignTasks(req)) return res.status(403).json({ message: 'Forbidden' })
  if (isSelf && !canReadTasks(req, userId)) return res.status(403).json({ message: 'Forbidden' })

  const { status, title, dueDate, description } = req.body

  const rawStatus = String(status || '').trim()
  if (!rawStatus) return res.status(400).json({ message: 'Status is required' })

  const nextStatus = String(rawStatus).toLowerCase()
  const normalizedStatus =
    nextStatus === 'completed' || nextStatus === 'complete' ? 'completed' :
    nextStatus === 'incomplete' ? 'pending' :
    nextStatus

  if (isSelf && !['completed', 'pending'].includes(normalizedStatus)) {
    return res.status(400).json({ message: "status must be 'completed' or 'pending'" })
  }

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })
  const now = new Date().toISOString()

  // Students: completion toggle only. Operators: can edit fields.
  let sql = `UPDATE assignments SET status = ?, updated_at = ?`
  const params = [normalizedStatus, now]

  if (!isSelf && canAssignTasks(req)) {
    if (title !== undefined) {
      sql += `, title = ?`
      params.push(String(title || '').trim())
    }
    if (description !== undefined) {
      sql += `, description = ?`
      params.push(String(description || '').trim())
    }
    if (dueDate !== undefined) {
      sql += `, due_date = ?`
      params.push(String(dueDate || '').trim())
    }
  }

  sql += ` WHERE id = ? AND tenant_id = ? AND user_id = ?`
  params.push(Number(id), tenantId, userId)

  const info = db.prepare(sql).run(...params)

  if (info.changes === 0) {
    return res.status(404).json({ message: 'Assignment not found' })
  }

  const row = db
    .prepare(`SELECT * FROM assignments WHERE id = ? AND tenant_id = ? AND user_id = ?`)
    .get(Number(id), tenantId, userId)
  return res.json(rowToAssignment(row))
})

router.delete('/:userId/assignments/:id', authMiddleware, (req, res) => {
  const { userId, id } = req.params
  if (!canAssignTasks(req)) return res.status(403).json({ message: 'Forbidden' })

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })
  const info = db.prepare(`DELETE FROM assignments WHERE id = ? AND tenant_id = ? AND user_id = ?`).run(Number(id), tenantId, userId)
  if (info.changes === 0) return res.status(404).json({ message: 'Assignment not found' })
  return res.json({ message: 'Assignment deleted' })
})

// Admin-only: completion stats per student
router.get('/:userId/assignments/stats', authMiddleware, (req, res) => {
  const { userId } = req.params
  if (!canReadTaskStats(req)) return res.status(403).json({ message: 'Forbidden' })
  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })

  const rows = db
    .prepare(
      `SELECT status, COUNT(1) AS n
       FROM assignments
       WHERE tenant_id = ? AND user_id = ?
       GROUP BY status`
    )
    .all(tenantId, userId)

  const byStatus = {}
  for (const r of rows) byStatus[String(r.status || '')] = Number(r.n || 0)
  const total = Object.values(byStatus).reduce((s, n) => s + Number(n || 0), 0)
  const completed = Number(byStatus.completed || 0)

  return res.json({ userId: String(userId), total, completed, completionRate: total ? Math.round((completed / total) * 100) : 0, byStatus })
})

router.post('/:userId/exams', authMiddleware, (req, res) => {
  const { userId } = req.params
  if (!canAssignTasks(req)) return res.status(403).json({ message: 'Forbidden' })
  const { subject, date, time } = req.body

  if (!subject || !date) {
    return res.status(400).json({ message: 'Subject and date required' })
  }

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })
  const now = new Date().toISOString()
  const normalizedSubject = String(subject).trim()
  const normalizedDate = String(date).trim()
  const normalizedTime = String(time || '10:00 AM').trim() || '10:00 AM'

  const info = db
    .prepare(
      `INSERT INTO exams (tenant_id, user_id, subject, date, time, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(tenantId, userId, normalizedSubject, normalizedDate, normalizedTime, req.user?.id || null, now, now)

  const row = db
    .prepare(`SELECT * FROM exams WHERE id = ? AND tenant_id = ? AND user_id = ?`)
    .get(info.lastInsertRowid, tenantId, userId)
  return res.status(201).json(rowToExam(row))
})

router.get('/:userId/exams', authMiddleware, (req, res) => {
  const { userId } = req.params
  if (!canReadTasks(req, userId)) return res.status(403).json({ message: 'Forbidden' })
  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })
  const rows = db
    .prepare(`SELECT * FROM exams WHERE tenant_id = ? AND user_id = ? ORDER BY date ASC, id DESC`)
    .all(tenantId, userId)
  return res.json(rows.map(rowToExam))
})

router.delete('/:userId/exams/:id', authMiddleware, (req, res) => {
  const { userId, id } = req.params
  if (!canAssignTasks(req)) return res.status(403).json({ message: 'Forbidden' })

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })
  const info = db.prepare(`DELETE FROM exams WHERE id = ? AND tenant_id = ? AND user_id = ?`).run(Number(id), tenantId, userId)
  if (info.changes === 0) return res.status(404).json({ message: 'Exam not found' })
  return res.json({ message: 'Exam deleted' })
})

export default router
