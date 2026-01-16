import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getDb } from '../lib/db.js'
import { listNotifications, markNotificationRead, normalizeNotificationRow } from '../lib/notificationsDal.js'
import { getTenantIdFromRequest } from '../lib/tenancy.js'

const router = express.Router()

// GET /api/notifications/me?limit=50&beforeId=123&unreadOnly=true
router.get('/me', authMiddleware, (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const tenantId = getTenantIdFromRequest(req)

  const limit = Number(req.query?.limit || 50)
  const beforeId = req.query?.beforeId ? Number(req.query.beforeId) : null
  const unreadOnly = String(req.query?.unreadOnly || '').toLowerCase() === 'true'

  const rows = listNotifications(db, userId, { tenantId, limit, beforeId, unreadOnly })
  return res.json({
    items: rows.map(normalizeNotificationRow),
    nextBeforeId: rows.length > 0 ? rows[rows.length - 1].id : null,
  })
})

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authMiddleware, (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const tenantId = getTenantIdFromRequest(req)
  const id = Number(req.params.id)

  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' })

  const ok = markNotificationRead(db, { userId, id, tenantId })
  if (!ok) return res.status(404).json({ message: 'Notification not found' })

  return res.json({ ok: true })
})

export default router
