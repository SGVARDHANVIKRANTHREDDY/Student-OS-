import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getDb } from '../lib/db.js'
import { listActivityEvents, normalizeActivityRow } from '../lib/activityDal.js'
import { getTenantIdFromRequest } from '../lib/tenancy.js'

const router = express.Router()

// GET /api/activity/me?limit=50&beforeId=123&type=A,B
router.get('/me', authMiddleware, (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const tenantId = getTenantIdFromRequest(req)

  const limit = Number(req.query?.limit || 50)
  const beforeId = req.query?.beforeId ? Number(req.query.beforeId) : null
  const typeParam = String(req.query?.type || '').trim()
  const types = typeParam ? typeParam.split(',').map((s) => s.trim()).filter(Boolean) : null

  const rows = listActivityEvents(db, userId, { tenantId, limit, beforeId, types })
  return res.json({
    items: rows.map(normalizeActivityRow),
    nextBeforeId: rows.length > 0 ? rows[rows.length - 1].id : null,
  })
})

export default router
