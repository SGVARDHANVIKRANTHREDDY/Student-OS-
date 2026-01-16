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
    return res.status(201).json(application)
  } catch (err) {
    if (isServiceError(err)) {
      if (err.httpStatus === 404) return res.status(404).json({ message: err.message })
      if (err.code === 'JOB_NOT_OPEN') return res.status(409).json({ message: err.message || 'Applications are not open for this job.' })
      if (err.code === 'DEADLINE_PASSED') {
        return res.status(409).json({ message: err.message || 'Applications are closed for this job (deadline passed).' })
      }
      if (err.code === 'DUPLICATE_APPLICATION') return res.status(409).json({ message: 'You have already applied to this job' })

      if (err.httpStatus === 429) {
        return res.status(429).json({
          message: err.message,
          code: err.code,
          limit: err.details?.limit ?? null,
          used: err.details?.used ?? null,
          period: err.details?.period ?? null,
        })
      }
      // Default: preserve machine-readable code; keep legacy message shape.
      return res.status(err.httpStatus).json({ message: err.message, code: err.code })
    }
    return next(err)
  }
})

router.get('/', authMiddleware, async (req, res, next) => {
  if (!requirePg(res)) return

  const tenantId = getTenantIdFromRequest(req)
  try {
    const data = await listMyApplications({ tenantId, actorUserId: req.user.id, query: req.query || {}, correlationId: req.id || null })
    return res.json(data)
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
    return res.json(data)
  } catch (err) {
    if (isServiceError(err)) return res.status(err.httpStatus).json(err.toResponseBody())
    return next(err)
  }
})

router.patch('/:id/status', authMiddleware, async (req, res, next) => {
  if (!requirePg(res)) return
  const tenantId = getTenantIdFromRequest(req)
  const applicationId = String(req.params.id || '').trim()
  const status = String(req.body?.status || '').trim()
  if (!applicationId) return res.status(400).json({ message: 'Invalid application id' })

  try {
    const result = await updateApplicationStatusAdmin({
      tenantId,
      actorUserId: req.user.id,
      auth: req.auth,
      applicationId,
      status,
      correlationId: req.id || null,
    })
    return res.json(result)
  } catch (err) {
    if (isServiceError(err)) {
      if (err.code === 'FORBIDDEN') {
        return res.status(403).json({ message: 'Forbidden: you are not allowed to change application status.' })
      }
      if (err.code === 'NOT_FOUND') return res.status(404).json({ message: 'Application not found' })
      if (err.code === 'INVALID_STATE' || err.code === 'INVALID_INPUT') {
        return res.status(400).json({ message: err.message })
      }
      return res.status(err.httpStatus).json(err.toResponseBody())
    }
    return next(err)
  }
})

export default router
