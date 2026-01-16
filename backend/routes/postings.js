import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { hasPermission, requirePermission } from '../lib/rbac.js'
import { getTenantIdFromRequest } from '../lib/tenancy.js'
import { writeAuditLog } from '../lib/auditDal.js'
import { emitActivityEvent } from '../lib/activityDal.js'
import { ACTIVITY_EVENT_TYPES } from '../lib/activityTypes.js'
import {
  requirePg,
  createJobPosting,
  updateJobPostingDraft,
  submitJobPosting,
  listMyJobPostings,
  listSubmittedPostings,
  reviewJobPosting,
} from '../lib/postingsDal.js'

const router = express.Router()

function pickActorRole(auth) {
  const roles = Array.isArray(auth?.roles) ? auth.roles : []
  if (roles.includes('RECRUITER')) return 'RECRUITER'
  if (roles.includes('COLLEGE_ADMIN')) return 'COLLEGE_ADMIN'
  if (roles.includes('PLATFORM_ADMIN')) return 'PLATFORM_ADMIN'
  return null
}

// Recruiter/College: create a draft posting
router.post(
  '/jobs',
  authMiddleware,
  requirePermission('postings:job:create'),
  async (req, res, next) => {
    if (!requirePg(res)) return

    const tenantId = getTenantIdFromRequest(req)
    const actorRole = pickActorRole(req.auth)
    if (!actorRole) return res.status(403).json({ message: 'Forbidden' })

    try {
      const result = await createJobPosting({ tenantId, userId: req.user.id, actorRole, input: req.body })
      if (!result.ok && result.code === 'VALIDATION') {
        return res.status(400).json({ message: result.message })
      }

      try {
        writeAuditLog({
          tenantId,
          actorType: 'USER',
          actorUserId: req.user.id,
          action: 'JOB_POSTING_CREATE',
          targetType: 'job_posting',
          targetId: result.postingId,
          metadata: { status: result.status, actorRole },
          correlationId: req.id || null,
        })
      } catch {
        // ignore
      }

      return res.status(201).json({ id: result.postingId, status: result.status })
    } catch (err) {
      return next(err)
    }
  }
)

// Recruiter/College: update draft
router.put(
  '/jobs/:id',
  authMiddleware,
  requirePermission('postings:job:create'),
  async (req, res, next) => {
    if (!requirePg(res)) return

    const tenantId = getTenantIdFromRequest(req)
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ message: 'id is required' })

    try {
      const result = await updateJobPostingDraft({ tenantId, userId: req.user.id, postingId: id, input: req.body })
      if (!result.ok && result.code === 'VALIDATION') return res.status(400).json({ message: result.message })
      if (!result.ok) return res.status(404).json({ message: 'Posting not found or not editable' })
      return res.json({ ok: true })
    } catch (err) {
      return next(err)
    }
  }
)

// Recruiter/College: submit draft for review
router.post(
  '/jobs/:id/submit',
  authMiddleware,
  requirePermission('postings:job:submit'),
  async (req, res, next) => {
    if (!requirePg(res)) return

    const tenantId = getTenantIdFromRequest(req)
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ message: 'id is required' })

    try {
      const result = await submitJobPosting({ tenantId, userId: req.user.id, postingId: id })
      if (!result.ok) return res.status(404).json({ message: 'Posting not found or not submittable' })

      try {
        writeAuditLog({
          tenantId,
          actorType: 'USER',
          actorUserId: req.user.id,
          action: 'JOB_POSTING_SUBMIT',
          targetType: 'job_posting',
          targetId: id,
          metadata: {},
          correlationId: req.id || null,
        })
      } catch {
        // ignore
      }

      return res.json({ ok: true, status: 'SUBMITTED' })
    } catch (err) {
      return next(err)
    }
  }
)

// Recruiter/College: list own postings
router.get(
  '/jobs/me',
  authMiddleware,
  requirePermission('postings:job:create'),
  async (req, res, next) => {
    if (!requirePg(res)) return

    const tenantId = getTenantIdFromRequest(req)
    const limit = Number(req.query?.limit || 50)

    try {
      const data = await listMyJobPostings({ tenantId, userId: req.user.id, limit })
      return res.json(data)
    } catch (err) {
      return next(err)
    }
  }
)

// Platform admin: list submitted postings
router.get(
  '/jobs/review',
  authMiddleware,
  requirePermission('postings:job:review'),
  async (req, res, next) => {
    if (!requirePg(res)) return

    const tenantId = getTenantIdFromRequest(req)
    const status = String(req.query?.status || 'SUBMITTED')
    const limit = Number(req.query?.limit || 50)

    try {
      const data = await listSubmittedPostings({ tenantId, status, limit })
      return res.json(data)
    } catch (err) {
      return next(err)
    }
  }
)

// Platform admin: approve/reject
router.post(
  '/jobs/:id/review',
  authMiddleware,
  requirePermission('postings:job:review'),
  async (req, res, next) => {
    if (!requirePg(res)) return

    const tenantId = getTenantIdFromRequest(req)
    const id = String(req.params.id || '').trim()
    const decision = String(req.body?.decision || '').trim()
    const reason = String(req.body?.reason || '').trim()

    if (!id) return res.status(400).json({ message: 'id is required' })

    const dec = decision.toUpperCase()
    if (dec === 'APPROVE' && !hasPermission(req.auth, 'postings:job:approve')) {
      return res.status(403).json({ message: 'Forbidden' })
    }
    if (dec === 'REJECT' && !hasPermission(req.auth, 'postings:job:reject')) {
      return res.status(403).json({ message: 'Forbidden' })
    }

    try {
      const result = await reviewJobPosting({
        tenantId,
        postingId: id,
        reviewerUserId: req.user.id,
        decision,
        reason,
      })

      if (!result.ok && result.code === 'VALIDATION') return res.status(400).json({ message: result.message })
      if (!result.ok && result.code === 'NOT_FOUND') return res.status(404).json({ message: 'Posting not found' })
      if (!result.ok && result.code === 'NOT_SUBMITTED') return res.status(409).json({ message: 'Posting not submitted' })

      try {
        writeAuditLog({
          tenantId,
          actorType: 'USER',
          actorUserId: req.user.id,
          action: result.status === 'APPROVED' ? 'JOB_POSTING_APPROVE' : 'JOB_POSTING_REJECT',
          targetType: 'job_posting',
          targetId: id,
          metadata: { publishedJobId: result.publishedJobId || null },
          correlationId: req.id || null,
        })
      } catch {
        // ignore
      }

      try {
        emitActivityEvent({
          tenantId,
          userId: req.user.id,
          type: ACTIVITY_EVENT_TYPES.JOB_POSTING_REVIEWED,
          source: 'API',
          status: 'SUCCESS',
          relatedEntityType: 'job_posting',
          relatedEntityId: id,
          correlationId: req.id || null,
          metadata: { decision: result.status, publishedJobId: result.publishedJobId || null },
          notify: false,
        })
      } catch {
        // ignore
      }

      return res.json({ ok: true, status: result.status, publishedJobId: result.publishedJobId || null })
    } catch (err) {
      return next(err)
    }
  }
)

export default router
