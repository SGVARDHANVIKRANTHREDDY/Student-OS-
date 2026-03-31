import { describe, it, expect, vi } from 'vitest'
import { requestTiming } from '../../lib/requestTiming.js'

describe('requestTiming middleware', () => {
  it('attaches startTime to req', () => {
    const middleware = requestTiming()
    const req = {}
    const res = {
      listeners: {},
      on(event, fn) { res.listeners[event] = fn },
      removeListener(event, fn) { /* noop */ },
      setHeader(k, v) { res.headers[k] = v },
      headers: {},
    }
    middleware(req, res, () => {})

    expect(req.startTime).toBeDefined()
    expect(typeof req.startTime).toBe('bigint')
  })

  it('sets X-Response-Time header on finish', () => {
    const middleware = requestTiming()
    const req = {}
    const res = {
      listeners: {},
      on(event, fn) { res.listeners[event] = fn },
      removeListener() {},
      setHeader(k, v) { res.headers[k] = v },
      headers: {},
    }
    const next = vi.fn()
    middleware(req, res, next)

    expect(next).toHaveBeenCalled()

    // Simulate the 'finish' event
    res.listeners['finish']()

    expect(res.headers['X-Response-Time']).toBeDefined()
    expect(res.headers['X-Response-Time']).toMatch(/^\d+\.\d+ms$/)
  })
})
