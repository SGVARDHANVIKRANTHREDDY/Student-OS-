import pino from 'pino'
import pinoHttp from 'pino-http'
import crypto from 'crypto'

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

export const logger = pino({
  level,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    remove: true,
  },
})

export const httpLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const headerId = req.headers['x-correlation-id'] || req.headers['x-request-id']
    const id = String(headerId || '').trim() || crypto.randomUUID()
    res.setHeader('X-Correlation-Id', id)
    return id
  },
  autoLogging: true,
  customProps(req) {
    return { correlationId: req.id }
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`
  },
})
