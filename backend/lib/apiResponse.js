/**
 * Standardized API response helpers.
 *
 * Every response follows the envelope:
 *   { ok: boolean, data?: T, error?: { code, message, details? }, meta?: M }
 *
 * Used by route handlers for consistent shape across the entire API surface.
 */

export function apiSuccess(res, data, { status = 200, meta } = {}) {
  const body = { ok: true, data }
  if (meta) body.meta = meta
  return res.status(status).json(body)
}

export function apiCreated(res, data, { meta } = {}) {
  return apiSuccess(res, data, { status: 201, meta })
}

export function apiError(res, { status = 500, code = 'INTERNAL_ERROR', message = 'Internal server error', details } = {}) {
  const body = { ok: false, error: { code, message } }
  if (details !== undefined) body.error.details = details
  return res.status(status).json(body)
}

export function apiValidationError(res, errors) {
  return apiError(res, {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    details: errors,
  })
}

export function apiNotFound(res, message = 'Resource not found') {
  return apiError(res, { status: 404, code: 'NOT_FOUND', message })
}

export function apiForbidden(res, message = 'Forbidden') {
  return apiError(res, { status: 403, code: 'FORBIDDEN', message })
}

export function apiUnauthorized(res, message = 'Authentication required') {
  return apiError(res, { status: 401, code: 'UNAUTHORIZED', message })
}

export function apiConflict(res, message = 'Conflict') {
  return apiError(res, { status: 409, code: 'CONFLICT', message })
}

export function apiTooMany(res, { retryAfterSec, message = 'Too many requests' } = {}) {
  if (retryAfterSec) res.setHeader('Retry-After', String(retryAfterSec))
  return apiError(res, { status: 429, code: 'RATE_LIMITED', message })
}

/**
 * Wrap paginated results in a standard envelope.
 */
export function apiPaginated(res, { items, total, page, pageSize, nextCursor } = {}) {
  const meta = {}
  if (total !== undefined) meta.total = total
  if (page !== undefined) meta.page = page
  if (pageSize !== undefined) meta.pageSize = pageSize
  if (nextCursor !== undefined) meta.nextCursor = nextCursor
  return apiSuccess(res, items, { meta })
}
