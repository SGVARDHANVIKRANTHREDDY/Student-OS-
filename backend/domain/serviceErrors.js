export class ServiceError extends Error {
  constructor({ httpStatus = 500, code = 'INTERNAL', message = 'Internal error', details = null } = {}) {
    super(message)
    this.name = 'ServiceError'
    this.httpStatus = httpStatus
    this.code = code
    this.details = details
  }

  toResponseBody() {
    const body = {
      message: this.message,
      code: this.code,
    }
    if (this.details !== null && this.details !== undefined) {
      body.details = this.details
    }
    return body
  }
}

export function isServiceError(err) {
  return !!err && (err instanceof ServiceError || err?.name === 'ServiceError')
}
