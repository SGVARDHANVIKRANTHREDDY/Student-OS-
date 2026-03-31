import { describe, it, expect, vi } from 'vitest'
import { validate } from '../../lib/validate.js'
import { z } from 'zod'

function mockReq(overrides = {}) {
  return { body: {}, query: {}, params: {}, ...overrides }
}

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res },
    json(data) { res.body = data; return res },
  }
  return res
}

describe('validate middleware', () => {
  it('calls next() on valid input', () => {
    const schema = z.object({ name: z.string() })
    const middleware = validate({ body: schema })
    const req = mockReq({ body: { name: 'Alice' } })
    const res = mockRes()
    const next = vi.fn()

    middleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.body.name).toBe('Alice')
  })

  it('replaces req.body with parsed data (trimming)', () => {
    const schema = z.object({ name: z.string().trim() })
    const middleware = validate({ body: schema })
    const req = mockReq({ body: { name: '  Bob  ' } })
    const res = mockRes()
    const next = vi.fn()

    middleware(req, res, next)

    expect(req.body.name).toBe('Bob')
  })

  it('returns 400 on invalid body', () => {
    const schema = z.object({ name: z.string().min(1) })
    const middleware = validate({ body: schema })
    const req = mockReq({ body: { name: '' } })
    const res = mockRes()
    const next = vi.fn()

    middleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('validates query params', () => {
    const schema = z.object({ page: z.coerce.number().int().min(1) })
    const middleware = validate({ query: schema })
    const req = mockReq({ query: { page: '3' } })
    const res = mockRes()
    const next = vi.fn()

    middleware(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.query.page).toBe(3)
  })

  it('validates URL params', () => {
    const schema = z.object({ id: z.coerce.number().int().positive() })
    const middleware = validate({ params: schema })
    const req = mockReq({ params: { id: '42' } })
    const res = mockRes()
    const next = vi.fn()

    middleware(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.params.id).toBe(42)
  })

  it('accumulates errors from multiple sources', () => {
    const bodySchema = z.object({ name: z.string().min(1) })
    const querySchema = z.object({ page: z.coerce.number().int().min(1) })
    const middleware = validate({ body: bodySchema, query: querySchema })
    const req = mockReq({ body: { name: '' }, query: { page: '-5' } })
    const res = mockRes()
    const next = vi.fn()

    middleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(2)
  })

  it('passes through with empty schemas', () => {
    const middleware = validate({})
    const req = mockReq()
    const res = mockRes()
    const next = vi.fn()

    middleware(req, res, next)

    expect(next).toHaveBeenCalled()
  })
})
