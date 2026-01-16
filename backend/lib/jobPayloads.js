export const JOB_SCHEMA_V1 = 1

export function resumeProcessingJobName() {
  return 'resume_processing.v1'
}

export function resumeMatchingJobName() {
  return 'resume_matching.v1'
}

export function learningPlanGenerationJobName() {
  return 'learning_plan_generation.v1'
}

export function resumeRenderingJobName() {
  return 'resume_rendering.v1'
}

export function makeResumeProcessingPayload({ userId, tenantId, resumeVersion, resumeDocumentId, resumeVersionId, source, correlationId }) {
  return {
    schemaVersion: JOB_SCHEMA_V1,
    userId,
    // Worker-side authz: who requested this job (defaults to self).
    actorUserId: userId,
    tenantId: tenantId || null,
    resumeVersion,
    // Optional durable identifiers (additive; backward compatible).
    resumeDocumentId: resumeDocumentId || source?.resumeDocumentId || null,
    resumeVersionId: resumeVersionId || source?.resumeVersionId || null,
    source: source || { type: 'unknown' },
    correlationId: correlationId || null,
    enqueuedAt: new Date().toISOString(),
  }
}

export function makeResumeMatchingPayload({ userId, actorUserId = null, resumeVersion, resumeVersionId, jobId, tenantId, correlationId }) {
  return {
    schemaVersion: JOB_SCHEMA_V1,
    userId,
    actorUserId: actorUserId || userId,
    tenantId: tenantId || null,
    resumeVersion,
    resumeVersionId: resumeVersionId || null,
    jobId,
    correlationId: correlationId || null,
    enqueuedAt: new Date().toISOString(),
  }
}

export function makeLearningPlanPayload({ userId, actorUserId = null, resumeVersion, resumeVersionId, jobId, tenantId, matchAlgorithmVersion, correlationId }) {
  return {
    schemaVersion: JOB_SCHEMA_V1,
    userId,
    actorUserId: actorUserId || userId,
    tenantId: tenantId || null,
    resumeVersion,
    resumeVersionId: resumeVersionId || null,
    jobId,
    matchAlgorithmVersion: matchAlgorithmVersion || 'v1',
    correlationId: correlationId || null,
    enqueuedAt: new Date().toISOString(),
  }
}

export function makeResumeRenderingPayload({ userId, actorUserId = null, tenantId, resumeVersion, resumeVersionId, templateId, correlationId }) {
  return {
    schemaVersion: JOB_SCHEMA_V1,
    userId,
    actorUserId: actorUserId || userId,
    tenantId: tenantId || null,
    resumeVersion,
    resumeVersionId: resumeVersionId || null,
    templateId,
    correlationId: correlationId || null,
    enqueuedAt: new Date().toISOString(),
  }
}
