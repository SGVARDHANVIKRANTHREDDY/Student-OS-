import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getTenantIdFromRequest, requirePg } from '../lib/jobsDal.js'
import {
  getMyJobStatuses,
  listMarketplaceJobs,
  getMarketplaceJobById,
  saveMarketplaceJob,
  unsaveMarketplaceJob,
} from '../services/jobService.js'
import { isServiceError } from '../domain/serviceErrors.js'

const router = express.Router()

// Module 4: Job status & pipeline visibility.
// GET /api/jobs/me/status?type=RESUME_PARSING&limit=50
router.get('/me/status', authMiddleware, async (req, res) => {
  const userId = req.user.id
  const limit = Number(req.query?.limit || 50)
  const type = String(req.query?.type || '').trim() || null
  try {
    const data = await getMyJobStatuses({ userId, limit, type, correlationId: req.id || null })
    return res.json(data)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return res.status(500).json({ message: 'Internal server error' })
  }
})

router.get('/', authMiddleware, async (req, res, next) => {
  if (!requirePg(res)) return
  const tenantId = getTenantIdFromRequest(req)
  try {
    const data = await listMarketplaceJobs({ tenantId, userId: req.user.id, query: req.query || {} })
    return res.json(data)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return next(err)
  }
})

router.get('/:id', authMiddleware, async (req, res, next) => {
  if (!requirePg(res)) return
  const tenantId = getTenantIdFromRequest(req)
  try {
    const job = await getMarketplaceJobById({ tenantId, userId: req.user.id, jobId: req.params.id })
    return res.json(job)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return next(err)
  }
})

router.post('/:id/save', authMiddleware, async (req, res, next) => {
  if (!requirePg(res)) return
  const tenantId = getTenantIdFromRequest(req)
  try {
    const out = await saveMarketplaceJob({ tenantId, userId: req.user.id, jobId: req.params.id })
    return res.json(out)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return next(err)
  }
})

router.delete('/:id/save', authMiddleware, async (req, res, next) => {
  if (!requirePg(res)) return
  const tenantId = getTenantIdFromRequest(req)
  try {
    const out = await unsaveMarketplaceJob({ tenantId, userId: req.user.id, jobId: req.params.id })
    return res.json(out)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return next(err)
  }
})

export default router
