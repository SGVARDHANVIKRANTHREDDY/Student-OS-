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
import { validate } from '../lib/validate.js'
import { jobStatusQuery, idStringParam } from '../lib/schemas.js'
import { apiSuccess, apiError } from '../lib/apiResponse.js'

const router = express.Router()

// Module 4: Job status & pipeline visibility.
// GET /api/jobs/me/status?type=RESUME_PARSING&limit=50
router.get('/me/status', authMiddleware, validate({ query: jobStatusQuery }), async (req, res) => {
  const userId = req.user.id
  const { limit, type } = req.query
  try {
    const data = await getMyJobStatuses({ userId, limit, type: type || null, correlationId: req.id || null })
    return apiSuccess(res, data)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return apiError(res)
  }
})

router.get('/', authMiddleware, async (req, res, next) => {
  if (!requirePg(res)) return
  const tenantId = getTenantIdFromRequest(req)
  try {
    const data = await listMarketplaceJobs({ tenantId, userId: req.user.id, query: req.query || {} })
    return apiSuccess(res, data)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return next(err)
  }
})

router.get('/:id', authMiddleware, validate({ params: idStringParam }), async (req, res, next) => {
  if (!requirePg(res)) return
  const tenantId = getTenantIdFromRequest(req)
  try {
    const job = await getMarketplaceJobById({ tenantId, userId: req.user.id, jobId: req.params.id })
    return apiSuccess(res, job)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return next(err)
  }
})

router.post('/:id/save', authMiddleware, validate({ params: idStringParam }), async (req, res, next) => {
  if (!requirePg(res)) return
  const tenantId = getTenantIdFromRequest(req)
  try {
    const out = await saveMarketplaceJob({ tenantId, userId: req.user.id, jobId: req.params.id })
    return apiSuccess(res, out)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return next(err)
  }
})

router.delete('/:id/save', authMiddleware, validate({ params: idStringParam }), async (req, res, next) => {
  if (!requirePg(res)) return
  const tenantId = getTenantIdFromRequest(req)
  try {
    const out = await unsaveMarketplaceJob({ tenantId, userId: req.user.id, jobId: req.params.id })
    return apiSuccess(res, out)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return next(err)
  }
})

export default router
