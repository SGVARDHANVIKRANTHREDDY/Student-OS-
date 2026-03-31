import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getDb } from '../lib/db.js'
import { listActivityEvents, normalizeActivityRow } from '../lib/activityDal.js'
import { getTenantIdFromRequest } from '../lib/tenancy.js'
import { validate } from '../lib/validate.js'
import { activityQuery } from '../lib/schemas.js'
import { apiSuccess } from '../lib/apiResponse.js'

const router = express.Router()

// GET /api/activity/me?limit=50&beforeId=123&type=A,B
router.get('/me', authMiddleware, validate({ query: activityQuery }), (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const tenantId = getTenantIdFromRequest(req)

  const { limit, beforeId, type } = req.query
  const types = type ? type.split(',').map((s) => s.trim()).filter(Boolean) : null

  const rows = listActivityEvents(db, userId, { tenantId, limit, beforeId, types })
  return apiSuccess(res, rows.map(normalizeActivityRow), {
    meta: { nextBeforeId: rows.length > 0 ? rows[rows.length - 1].id : null },
  })
})

export default router
