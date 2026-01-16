import { ServiceError } from '../domain/serviceErrors.js'

// CourseService is intentionally a minimal stub in Phase 1.
// Learning routes currently own their orchestration; we will migrate use-cases here incrementally
// without breaking existing APIs or frontend behavior.
//
// Layering target:
// Routes -> CourseService -> learning domain -> repositories/DAL

export class CourseService {
  constructor() {}

  // Placeholder to establish the service boundary for learning.
  // When we migrate, this will validate permissions, tenant/org scope, and invariants,
  // then call repositories and emit audit/activity/notifications.
  async notImplemented() {
    throw new ServiceError({ httpStatus: 501, code: 'NOT_IMPLEMENTED', message: 'CourseService not implemented yet' })
  }
}

export const courseService = new CourseService()
