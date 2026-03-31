import crypto from 'crypto'

const HEADER = 'x-request-id'

/**
 * Express middleware: assigns a unique correlation ID to every request.
 * If the upstream proxy already set X-Request-Id, re-use it; otherwise generate one.
 * The ID is available via `req.id` and echoed in the response header.
 */
export function correlationId() {
  return (req, _res, next) => {
    const incoming = req.headers[HEADER]
    req.id = typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
      ? incoming
      : crypto.randomUUID()
    _res.setHeader(HEADER, req.id)
    next()
  }
}
