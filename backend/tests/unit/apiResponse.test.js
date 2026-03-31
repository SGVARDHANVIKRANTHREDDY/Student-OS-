import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  apiSuccess,
  apiCreated,
  apiError,
  apiValidationError,
  apiNotFound,
  apiForbidden,
  apiUnauthorized,
  apiConflict,
  apiTooMany,
  apiPaginated,
} from '../../lib/apiResponse.js'

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) { res.statusCode = code; return res },
    json(data) { res.body = data; return res },
    setHeader(k, v) { res.headers[k] = v; return res },
  }
  return res
}

describe('apiSuccess', () => {
  it('returns 200 with ok:true envelope', () => {
    const res = mockRes()
    apiSuccess(res, { foo: 'bar' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, data: { foo: 'bar' } })
  })

  it('accepts custom status', () => {
    const res = mockRes()
    apiSuccess(res, null, { status: 202 })
    expect(res.statusCode).toBe(202)
  })

  it('includes meta when provided', () => {
    const res = mockRes()
    apiSuccess(res, [], { meta: { total: 5 } })
    expect(res.body.meta).toEqual({ total: 5 })
  })
})

describe('apiCreated', () => {
  it('returns 201', () => {
    const res = mockRes()
    apiCreated(res, { id: 1 })
    expect(res.statusCode).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.id).toBe(1)
  })
})

describe('apiError', () => {
  it('returns error envelope with defaults', () => {
    const res = mockRes()
    apiError(res)
    expect(res.statusCode).toBe(500)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('INTERNAL_ERROR')
  })

  it('accepts custom params', () => {
    const res = mockRes()
    apiError(res, { status: 422, code: 'CUSTOM', message: 'custom msg', details: { a: 1 } })
    expect(res.statusCode).toBe(422)
    expect(res.body.error.message).toBe('custom msg')
    expect(res.body.error.details).toEqual({ a: 1 })
  })
})

describe('apiValidationError', () => {
  it('returns 400 with VALIDATION_ERROR code', () => {
    const res = mockRes()
    apiValidationError(res, [{ path: 'email', message: 'required' }])
    expect(res.statusCode).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details).toHaveLength(1)
  })
})

describe('apiNotFound', () => {
  it('returns 404', () => {
    const res = mockRes()
    apiNotFound(res)
    expect(res.statusCode).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('accepts custom message', () => {
    const res = mockRes()
    apiNotFound(res, 'Job not found')
    expect(res.body.error.message).toBe('Job not found')
  })
})

describe('apiForbidden', () => {
  it('returns 403', () => {
    const res = mockRes()
    apiForbidden(res)
    expect(res.statusCode).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })
})

describe('apiUnauthorized', () => {
  it('returns 401', () => {
    const res = mockRes()
    apiUnauthorized(res)
    expect(res.statusCode).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})

describe('apiConflict', () => {
  it('returns 409', () => {
    const res = mockRes()
    apiConflict(res)
    expect(res.statusCode).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
  })
})

describe('apiTooMany', () => {
  it('returns 429 with Retry-After header', () => {
    const res = mockRes()
    apiTooMany(res, { retryAfterSec: 30 })
    expect(res.statusCode).toBe(429)
    expect(res.body.error.code).toBe('RATE_LIMITED')
    expect(res.headers['Retry-After']).toBe('30')
  })
})

describe('apiPaginated', () => {
  it('paginates with page/total meta', () => {
    const res = mockRes()
    apiPaginated(res, { items: [1, 2], total: 100, page: 2, pageSize: 10 })
    expect(res.body.ok).toBe(true)
    expect(res.body.data).toEqual([1, 2])
    expect(res.body.meta.total).toBe(100)
    expect(res.body.meta.page).toBe(2)
    expect(res.body.meta.pageSize).toBe(10)
  })

  it('paginates with cursor meta', () => {
    const res = mockRes()
    apiPaginated(res, { items: ['a'], nextCursor: 'abc123' })
    expect(res.body.meta.nextCursor).toBe('abc123')
  })
})
