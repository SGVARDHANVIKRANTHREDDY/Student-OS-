import { ZodError } from 'zod'
import { apiValidationError } from './apiResponse.js'

/**
 * Express middleware factory – validates `req.body`, `req.query`, and/or
 * `req.params` against Zod schemas.
 *
 * Usage:
 *   router.post('/foo', validate({ body: myZodSchema }), handler)
 *   router.get('/bar', validate({ query: searchSchema }), handler)
 *   router.put('/:id', validate({ params: idSchema, body: updateSchema }), handler)
 *
 * On validation failure returns 400 with a standardized error envelope
 * whose `details` array describes every field-level issue.
 */
export function validate(schemas = {}) {
  return (req, res, next) => {
    const errors = []

    for (const [source, schema] of Object.entries(schemas)) {
      if (!schema) continue
      const result = schema.safeParse(req[source])
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({
            source,
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })
        }
      } else {
        // Replace with parsed & coerced values (trimmed strings, coerced numbers, etc.)
        req[source] = result.data
      }
    }

    if (errors.length > 0) {
      return apiValidationError(res, errors)
    }

    next()
  }
}
