import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getTenantIdFromRequest, requirePg } from '../lib/jobsDal.js'
import {
  applyToJob,
  listMyApplications,
  listApplicationsAdmin,
  updateApplicationStatusAdmin,
} from '../services/applicationService.js'
import { requirePermission } from '../lib/rbac.js'
import { isServiceError } from '../domain/serviceErrors.js'
import { validate } from '../lib/validate.js'
import { idStringParam, applicationStatusBody } from '../lib/schemas.js'
import { apiSuccess, apiCreated, apiError, apiForbidden, apiNotFound, apiConflict, apiTooMany } from '../lib/apiResponse.js'

const router = express.Router()

router.post('/', authMiddleware, async (req, res, next) => {
  if (!requirePg(res)) return

  const tenantId = getTenantIdFromRequest(req)
  try {
    const application = await applyToJob({
      tenantId,
      actorUserId: req.user.id,
      auth: req.auth,
      jobId: req.body?.jobId,
      resumeVersion: req.body?.resumeVersion,
      correlationId: req.id || null,
    })
    return apiCreated(res, application)
  } catch (err) {
    if (isServiceError(err)) {
      if (err.httpStatus === 404) return apiNotFound(res, err.message)
      if (err.code === 'JOB_NOT_OPEN') return apiConflict(res, err.message || 'Applications are not open for this job.')
      if (err.code === 'DEADLINE_PASSED') return apiConflict(res, err.message || 'Applications are closed for this job (deadline passed).')
      if (err.code === 'DUPLICATE_APPLICATION') return apiConflict(res, 'You have already applied to this job')
      if (err.httpStatus === 429) {
        return apiTooMany(res, { message: err.message })
      }
      return res.status(err.httpStatus).json(err.toResponseBody())
    }
    return next(err)
  }
})

router.get('/', authMiddleware, async (req, res, next) => {
  if (!requirePg(res)) return

  const tenantId = getTenantIdFromRequest(req)
  try {
    const data = await listMyApplications({ tenantId, actorUserId: req.user.id, query: req.query || {}, correlationId: req.id || null })
    return apiSuccess(res, data)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return next(err)
  }
})

// Operator/admin application visibility + lifecycle control.
router.get('/admin', authMiddleware, requirePermission('applications:read:any'), async (req, res, next) => {
  if (!requirePg(res)) return
  const tenantId = getTenantIdFromRequest(req)
  try {
    const data = await listApplicationsAdmin({ tenantId, auth: req.auth, query: req.query || {}, correlationId: req.id || null })
    return apiSuccess(res, data)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return next(err)
  }
})

router.patch('/:id/status', authMiddleware, validate({ params: idStringParam, body: applicationStatusBody }), async (req, res, next) => {
  if (!requirePg(res)) return
  const tenantId = getTenantIdFromRequest(req)
  const { id: applicationId } = req.params
  const { status } = req.body

  try {
    const result = await updateApplicationStatusAdmin({
      tenantId,
      actorUserId: req.user.id,
      auth: req.auth,
      applicationId,
      status,
      correlationId: req.id || null,
    })
    return apiSuccess(res, result)
  } catch (err) {
    if (isServiceError(err)) {
      if (err.code === 'FORBIDDEN') return apiForbidden(res, 'You are not allowed to change application status.')
      if (err.code === 'NOT_FOUND') return apiNotFound(res, 'Application not found')
      if (err.code === 'INVALID_STATE' || err.code === 'INVALID_INPUT') {
        return apiError(res, { status: 400, code: err.code, message: err.message })
      }
      return res.status(err.httpStatus).json(err.toResponseBody())
    }
    return next(err)
  }
})

export default router
