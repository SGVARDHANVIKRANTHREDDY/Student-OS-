import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { requirePg, getTenantIdFromRequest } from '../lib/jobsDal.js'
import { requirePermission } from '../lib/rbac.js'
import { getDb } from '../lib/db.js'
import { createJobAdmin, updateJobMarketplaceAdmin } from '../services/jobService.js'
import { isServiceError } from '../domain/serviceErrors.js'

const router = express.Router()

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[\r\n,"]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

// Tenant-scoped user visibility for operators.
router.get('/users', authMiddleware, requirePermission('users:read:any'), (req, res) => {

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  const limit = Math.min(Math.max(Number(req.query?.limit || 100), 1), 500)
  const offset = Math.max(Number(req.query?.offset || 0), 0)

  const users = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.created_at, tm.status as membership_status
       FROM users u
       JOIN tenant_memberships tm ON tm.user_id = u.id
       WHERE tm.tenant_id = ? AND tm.status = 'ACTIVE'
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(tenantId, limit, offset)

  const rolesRows = db
    .prepare(
      `SELECT user_id, group_concat(role_key) AS roles
       FROM tenant_role_assignments
       WHERE tenant_id = ? AND status = 'ACTIVE'
       GROUP BY user_id`
    )
    .all(tenantId)

  const rolesByUser = new Map()
  for (const r of rolesRows) {
    const roles = String(r.roles || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
    rolesByUser.set(r.user_id, roles)
  }

  return res.json({
    items: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      roles: rolesByUser.get(u.id) || [],
      createdAt: u.created_at,
    })),
    limit,
    offset,
  })
})

router.get('/users/export.csv', authMiddleware, requirePermission('users:export:any'), (req, res) => {

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)

  const users = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.created_at
       FROM users u
       JOIN tenant_memberships tm ON tm.user_id = u.id
       WHERE tm.tenant_id = ? AND tm.status = 'ACTIVE'
       ORDER BY u.created_at DESC`
    )
    .all(tenantId)

  const rolesRows = db
    .prepare(
      `SELECT user_id, group_concat(role_key) AS roles
       FROM tenant_role_assignments
       WHERE tenant_id = ? AND status = 'ACTIVE'
       GROUP BY user_id`
    )
    .all(tenantId)

  const rolesByUser = new Map()
  for (const r of rolesRows) {
    rolesByUser.set(r.user_id, String(r.roles || ''))
  }

  const header = ['id', 'email', 'name', 'roles', 'createdAt']
  const lines = [header.join(',')]
  for (const u of users) {
    lines.push(
      [u.id, u.email, u.name, rolesByUser.get(u.id) || '', u.created_at]
        .map(csvEscape)
        .join(',')
    )
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="users.csv"')
  return res.send(lines.join('\n'))
})

router.post('/jobs', authMiddleware, async (req, res, next) => {
  if (!requirePg(res)) return

  const tenantId = getTenantIdFromRequest(req)
  try {
    const created = await createJobAdmin({
      tenantId,
      actorUserId: req.user.id,
      auth: req.auth,
      input: req.body || {},
      correlationId: req.id || null,
    })
    return res.status(201).json(created)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return next(err)
  }
})

// Marketplace: admin-owned job management (edit fields, set deadlines, open/close/archive).
router.patch('/jobs/:id', authMiddleware, async (req, res, next) => {
  if (!requirePg(res)) return
  const tenantId = getTenantIdFromRequest(req)
  const jobId = String(req.params.id || '').trim()
  if (!jobId) return res.status(400).json({ message: 'Job id is required' })

  try {
    const result = await updateJobMarketplaceAdmin({
      tenantId,
      actorUserId: req.user.id,
      auth: req.auth,
      jobId,
      patch: req.body || {},
      correlationId: req.id || null,
    })
    return res.json(result)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return next(err)
  }
})

export default router
