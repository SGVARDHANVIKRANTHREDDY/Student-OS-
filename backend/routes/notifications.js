import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getDb } from '../lib/db.js'
import { listNotifications, markNotificationRead, normalizeNotificationRow } from '../lib/notificationsDal.js'
import { getTenantIdFromRequest } from '../lib/tenancy.js'
import { validate } from '../lib/validate.js'
import { notificationsQuery, idParam } from '../lib/schemas.js'
import { apiSuccess, apiNotFound, apiPaginated } from '../lib/apiResponse.js'

const router = express.Router()

// GET /api/notifications/me?limit=50&beforeId=123&unreadOnly=true
router.get('/me', authMiddleware, validate({ query: notificationsQuery }), (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const tenantId = getTenantIdFromRequest(req)

  const { limit, beforeId, unreadOnly } = req.query

  const rows = listNotifications(db, userId, { tenantId, limit, beforeId, unreadOnly: unreadOnly === 'true' })
  return apiSuccess(res, rows.map(normalizeNotificationRow), {
    meta: { nextBeforeId: rows.length > 0 ? rows[rows.length - 1].id : null },
  })
})

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authMiddleware, validate({ params: idParam }), (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const tenantId = getTenantIdFromRequest(req)
  const { id } = req.params

  const ok = markNotificationRead(db, { userId, id, tenantId })
  if (!ok) return apiNotFound(res, 'Notification not found')

  return apiSuccess(res, { ok: true })
})

export default router
