import { getDb } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { isPgConfigured } from '../lib/pg.js'
import { getJobById } from '../lib/jobsDal.js'
import { upsertJobMatchScore } from '../lib/jobsDal.js'
import { extractSkillsFromText, computeExplainableMatch, MATCH_ALGORITHM_VERSION } from '../lib/matchingEngine.js'
import { getResumeParsedSnapshot } from '../lib/resumeDomain.js'
import { listUserSkills, upsertUserSkills } from '../lib/userSkillsDal.js'
import { getQueues, QUEUE_NAMES, enqueueWithTenantQuota } from '../lib/queues.js'
import { learningPlanGenerationJobName, makeLearningPlanPayload } from '../lib/jobPayloads.js'
import { recordJobFailed, recordJobQueued } from '../lib/jobStatusDal.js'
import { JOB_TYPES } from '../lib/activityTypes.js'

function nowIso() {
  return new Date().toISOString()
}

function upsertMatchResult(db, {
  userId,
  tenantId,
  jobId,
  resumeVersionLabel,
  resumeVersionId,
  algorithmVersion,
  score,
  breakdown,
  strengths,
  missingSkills,
}) {
  const now = nowIso()

  db.prepare(
    `INSERT INTO resume_job_matches
      (user_id, tenant_id, job_id, resume_version_label, resume_version_id, algorithm_version,
       match_score, breakdown_json, missing_skills_json, strengths_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, tenant_id, job_id, resume_version_label, algorithm_version)
     DO UPDATE SET
       resume_version_id = excluded.resume_version_id,
       match_score = excluded.match_score,
       breakdown_json = excluded.breakdown_json,
       missing_skills_json = excluded.missing_skills_json,
       strengths_json = excluded.strengths_json,
       updated_at = excluded.updated_at`
  ).run(
    userId,
    tenantId || null,
    jobId,
    resumeVersionLabel,
    resumeVersionId || null,
    algorithmVersion,
    score,
    JSON.stringify(breakdown),
    JSON.stringify(missingSkills),
    JSON.stringify(strengths),
    now,
    now
  )
}

export async function processMatch(job) {
  const started = Date.now()
  const { userId, tenantId, jobId, resumeVersion, resumeVersionId } = job.data || {}
  if (!userId) throw new Error('resume_matching: missing userId')
  if (!jobId) throw new Error('resume_matching: missing jobId')
  if (!resumeVersion && !resumeVersionId) throw new Error('resume_matching: missing resumeVersion/resumeVersionId')

  if (!isPgConfigured()) {
    throw new Error('Jobs database is not configured (PG_URL missing)')
  }

  const db = getDb()

  let versionRow
  if (resumeVersionId) {
    versionRow = db
      .prepare(
        `SELECT rv.*
         FROM resume_versions rv
         JOIN resume_documents rd ON rd.id = rv.resume_document_id
         WHERE rv.id = ? AND rd.user_id = ?
         LIMIT 1`
      )
      .get(resumeVersionId, userId)
  } else {
    const doc = db.prepare('SELECT id FROM resume_documents WHERE user_id = ?').get(userId)
    if (doc) {
      versionRow = db
        .prepare('SELECT * FROM resume_versions WHERE resume_document_id = ? AND version_label = ?')
        .get(doc.id, resumeVersion)
    }
  }

  if (!versionRow) throw new Error('resume_matching: resume version not found')

  const snapshot = getResumeParsedSnapshot(db, versionRow.id)
  if (!snapshot) throw new Error('resume_matching: missing parsed snapshot')

  const jobRec = await getJobById({ tenantId: tenantId || null, userId, jobId })
  if (!jobRec) throw new Error('resume_matching: job not found')

  const jobText = [jobRec.title, jobRec.description, jobRec.requirements].filter(Boolean).join('\n\n')
  const jobSkills = extractSkillsFromText(jobText)

  // Compute from persistent user_skills only.
  let userSkills = []
  try {
    userSkills = listUserSkills(db, { tenantId: tenantId || null, userId })
  } catch {
    userSkills = []
  }

  if (!userSkills || userSkills.length === 0) {
    // Backward-compatible bootstrap: seed user_skills from parsed snapshot, then compute.
    try {
      upsertUserSkills(db, {
        tenantId: tenantId || null,
        userId,
        skills: snapshot.skills || [],
        source: 'resume',
        proficiency: 40,
      })
      userSkills = listUserSkills(db, { tenantId: tenantId || null, userId })
    } catch {
      userSkills = []
    }
  }

  const resumeSkillsForMatch = (userSkills || []).map((s) => s.name)
  const match = computeExplainableMatch({ resumeSkills: resumeSkillsForMatch, jobSkills })

  upsertMatchResult(db, {
    userId,
    tenantId: tenantId || null,
    jobId: String(jobId),
    resumeVersionLabel: versionRow.version_label,
    resumeVersionId: versionRow.id,
    algorithmVersion: MATCH_ALGORITHM_VERSION,
    score: match.score,
    breakdown: match.breakdown,
    strengths: match.strengths,
    missingSkills: match.missingSkills,
  })

  // Best-effort: denormalize match score into Postgres for scalable ranking.
  try {
    await upsertJobMatchScore({
      tenantId: tenantId || null,
      userId,
      jobId: String(jobId),
      algorithmVersion: MATCH_ALGORITHM_VERSION,
      score: match.score,
    })
  } catch {
    // ignore
  }

  // Trigger learning plan generation (idempotent jobId).
  const queues = getQueues()
  const learningPayload = makeLearningPlanPayload({
    userId,
    tenantId: tenantId || null,
    resumeVersion: versionRow.version_label,
    resumeVersionId: versionRow.id,
    jobId: String(jobId),
    matchAlgorithmVersion: MATCH_ALGORITHM_VERSION,
    correlationId: job?.data?.correlationId || null,
  })

  const lpJobKey = `learn:${userId}:${tenantId || 'default'}:${versionRow.version_label}:${jobId}:${MATCH_ALGORITHM_VERSION}`

  // Durable visibility for downstream async pipeline.
  try {
    recordJobQueued({
      userId,
      jobType: JOB_TYPES.LEARNING_PLAN,
      scopeType: 'learning_plan',
      scopeKey: `${tenantId || 'default'}:${versionRow.version_label}:${String(jobId)}`,
      queueName: QUEUE_NAMES.learningPlanGeneration,
      jobName: learningPlanGenerationJobName(),
      bullmqJobId: lpJobKey,
      correlationId: job?.data?.correlationId || null,
      payload: learningPayload,
      maxAttempts: Number(process.env.BULLMQ_ATTEMPTS || 5),
    })
  } catch {
    // ignore
  }

  const enq = await enqueueWithTenantQuota(queues.learningPlanGeneration, {
    jobName: learningPlanGenerationJobName(),
    payload: learningPayload,
    jobId: lpJobKey,
    tenantId: tenantId || null,
    featureKey: 'enqueue_learning_plan_per_minute',
    windowSec: 60,
    defaultMax: 60,
  })

  if (!enq.ok) {
    try {
      recordJobFailed({
        userId,
        tenantId: tenantId || null,
        jobType: JOB_TYPES.LEARNING_PLAN,
        scopeType: 'learning_plan',
        scopeKey: `${tenantId || 'default'}:${versionRow.version_label}:${String(jobId)}`,
        attemptsMade: 0,
        correlationId: job?.data?.correlationId || null,
        errorPublic: enq.message,
        errorCode: enq.code || 'TENANT_QUOTA',
      })
    } catch {
      // ignore
    }

    return { ok: true, score: match.score, algorithmVersion: MATCH_ALGORITHM_VERSION, skippedLearning: true, durationMs: Date.now() - started }
  }

  logger.info(
    {
      jobId: job.id,
      userId,
      resumeVersion: versionRow.version_label,
      targetJobId: jobId,
      score: match.score,
      durationMs: Date.now() - started,
    },
    '[worker] resume_matching complete'
  )

  return { ok: true, score: match.score, algorithmVersion: MATCH_ALGORITHM_VERSION, durationMs: Date.now() - started }
}
