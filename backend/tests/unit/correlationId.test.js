import { describe, it, expect } from 'vitest'
import { correlationId } from '../../lib/correlationId.js'

function mockReq(headers = {}) {
  return { headers }
}

function mockRes() {
  const res = { headers: {} }
  res.setHeader = (k, v) => { res.headers[k] = v }
  return res
}

describe('correlationId middleware', () => {
  it('generates a UUID when no header is present', () => {
    const middleware = correlationId()
    const req = mockReq()
    const res = mockRes()
    let called = false
    middleware(req, res, () => { called = true })

    expect(called).toBe(true)
    expect(req.id).toBeTruthy()
    expect(typeof req.id).toBe('string')
    // UUID format
    expect(req.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(res.headers['x-request-id']).toBe(req.id)
  })

  it('re-uses incoming x-request-id header', () => {
    const middleware = correlationId()
    const req = mockReq({ 'x-request-id': 'abc-123' })
    const res = mockRes()
    middleware(req, res, () => {})

    expect(req.id).toBe('abc-123')
    expect(res.headers['x-request-id']).toBe('abc-123')
  })

  it('rejects overly long headers and generates new ID', () => {
    const middleware = correlationId()
    const longId = 'x'.repeat(200)
    const req = mockReq({ 'x-request-id': longId })
    const res = mockRes()
    middleware(req, res, () => {})

    expect(req.id).not.toBe(longId)
    expect(req.id.length).toBeLessThan(200)
  })

  it('rejects empty header and generates new ID', () => {
    const middleware = correlationId()
    const req = mockReq({ 'x-request-id': '' })
    const res = mockRes()
    middleware(req, res, () => {})

    expect(req.id).toBeTruthy()
    expect(req.id.length).toBeGreaterThan(0)
  })
})
