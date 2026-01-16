export const JOB_STATUS = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
}

export function normalizeJobStatus(value) {
  const s = String(value || '').trim().toUpperCase()
  return s || ''
}

export function parseDeadlineAtForWrite(deadlineAt) {
  if (deadlineAt === undefined) return { ok: true, value: undefined }
  if (deadlineAt === null || deadlineAt === '') return { ok: true, value: null }

  const d = new Date(deadlineAt)
  if (Number.isNaN(d.getTime())) {
    return { ok: false, code: 'INVALID_INPUT', message: 'deadlineAt must be an ISO timestamp' }
  }
  return { ok: true, value: d.toISOString() }
}

export function isDeadlinePassed(deadlineAt, now = new Date()) {
  if (!deadlineAt) return false
  const d = new Date(deadlineAt)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() <= now.getTime()
}

export function validateJobStatusTransition({ fromStatus, toStatus }) {
  const from = normalizeJobStatus(fromStatus)
  const to = normalizeJobStatus(toStatus)
  if (!to) return { ok: true, changed: false }

  const allowedTransitions = new Map([
    [JOB_STATUS.DRAFT, new Set([JOB_STATUS.OPEN, JOB_STATUS.ARCHIVED])],
    [JOB_STATUS.OPEN, new Set([JOB_STATUS.CLOSED, JOB_STATUS.ARCHIVED])],
    [JOB_STATUS.CLOSED, new Set([JOB_STATUS.OPEN, JOB_STATUS.ARCHIVED])],
    [JOB_STATUS.ARCHIVED, new Set([])],
  ])

  const allowed = allowedTransitions.get(from) || new Set()
  if (!allowed.has(to)) {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: `Invalid job status transition: ${from || 'UNKNOWN'} -> ${to}`,
    }
  }

  return { ok: true, changed: from !== to }
}
