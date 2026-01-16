import fs from 'fs/promises'
import path from 'path'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { getDb } from '../lib/db.js'
import { getQueues, QUEUE_NAMES, enqueueWithTenantQuota } from '../lib/queues.js'
import { logger } from '../lib/logger.js'
import { isPgConfigured } from '../lib/pg.js'
import {
  getResumeParsedSnapshot,
  setResumeVersionStatus,
  upsertResumeParsedSnapshot,
  ensureDataDir,
  resumeStatuses,
} from '../lib/resumeDomain.js'
import { extractSkillsFromText, normalizeSkills, MATCH_ALGORITHM_VERSION } from '../lib/matchingEngine.js'
import { upsertUserSkills } from '../lib/userSkillsDal.js'
import { resumeMatchingJobName, makeResumeMatchingPayload } from '../lib/jobPayloads.js'
import { recordJobFailed, recordJobQueued } from '../lib/jobStatusDal.js'
import { JOB_TYPES } from '../lib/activityTypes.js'
import { toPublicError } from '../lib/publicErrors.js'

function nowIso() {
  return new Date().toISOString()
}

function buildParsedSnapshotFromText(text) {
  const t = String(text || '').trim()
  const skills = extractSkillsFromText(t)

  const summary = t.length > 0 ? t.slice(0, 600) : ''

  return {
    summary,
    education: [],
    skills,
    projects: [],
    experience: [],
    source: {
      type: 'pdf',
      extractedAt: nowIso(),
      textLength: t.length,
    },
  }
}

async function readPdfText(filePath) {
  const data = await fs.readFile(filePath)
  const parsed = await pdfParse(data)
  return parsed?.text || ''
}

async function enqueueTargetMatches({ userId, resumeVersionLabel, resumeVersionId, correlationId = null }) {
  if (!isPgConfigured()) return
  const db = getDb()
  const targets = db
    .prepare(
      `SELECT job_id, tenant_id
       FROM resume_targets
       WHERE user_id = ? AND is_active = 1`
    )
    .all(userId)

  if (!targets || targets.length === 0) return

  const queues = getQueues()

  await Promise.all(
    targets.map((t) => {
      const tenantId = t.tenant_id || null
      const jobId = String(t.job_id)

      const payload = makeResumeMatchingPayload({
        userId,
        tenantId,
        resumeVersion: resumeVersionLabel,
        resumeVersionId,
        jobId,
        correlationId,
      })

      const jobKey = `match:${userId}:${tenantId || 'default'}:${resumeVersionLabel}:${jobId}:${MATCH_ALGORITHM_VERSION}`

      // Durable visibility for the async pipeline.
      try {
        recordJobQueued({
          userId,
          jobType: JOB_TYPES.RESUME_MATCHING,
          scopeType: 'match',
          scopeKey: `${tenantId || 'default'}:${resumeVersionLabel}:${jobId}`,
          queueName: QUEUE_NAMES.resumeMatching,
          jobName: resumeMatchingJobName(),
          bullmqJobId: jobKey,
          correlationId,
          payload,
          maxAttempts: Number(process.env.BULLMQ_ATTEMPTS || 5),
        })
      } catch {
        // ignore
      }

      return enqueueWithTenantQuota(queues.resumeMatching, {
        jobName: resumeMatchingJobName(),
        payload,
        jobId: jobKey,
        tenantId,
        featureKey: 'enqueue_resume_matching_per_minute',
        windowSec: 60,
        defaultMax: 120,
      }).then((enq) => {
        if (enq && enq.ok) return enq

        try {
          recordJobFailed({
            userId,
            tenantId: tenantId || null,
            jobType: JOB_TYPES.RESUME_MATCHING,
            scopeType: 'match',
            scopeKey: `${tenantId || 'default'}:${resumeVersionLabel}:${jobId}`,
            attemptsMade: 0,
            correlationId,
            errorPublic: enq?.message || "You've reached your tenant quota. Please try again later.",
            errorCode: enq?.code || 'TENANT_QUOTA',
          })
        } catch {
          // ignore
        }

        return enq
      })
    })
  )
}

export async function processResume(job) {
  const started = Date.now()
  const { userId, tenantId, resumeVersion, resumeVersionId } = job.data || {}
  if (!userId) throw new Error('resume_processing: missing userId')

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
  } else if (resumeVersion) {
    const doc = db.prepare('SELECT id FROM resume_documents WHERE user_id = ?').get(userId)
    if (doc) {
      versionRow = db
        .prepare('SELECT * FROM resume_versions WHERE resume_document_id = ? AND version_label = ?')
        .get(doc.id, resumeVersion)
    }
  }

  if (!versionRow) throw new Error('resume_processing: resume version not found')

  const status = resumeStatuses()

  const existingSnapshot = getResumeParsedSnapshot(db, versionRow.id)
  if (versionRow.status === status.parsed && existingSnapshot) {
    return { ok: true, skipped: true, resumeVersionId: versionRow.id, durationMs: Date.now() - started }
  }

  setResumeVersionStatus(db, versionRow.id, { status: status.parsing })

  try {
    let snapshot = existingSnapshot

    if (versionRow.source_type === 'upload') {
      const fileRow = db.prepare('SELECT * FROM resume_files WHERE resume_version_id = ?').get(versionRow.id)
      if (!fileRow?.storage_path) throw new Error('resume_processing: missing resume file')

      const text = await readPdfText(fileRow.storage_path)
      snapshot = buildParsedSnapshotFromText(text)
    }

    // form sources store snapshot during ingestion; normalize skills deterministically.
    const normalizedSkills = normalizeSkills(snapshot?.skills || [])
    snapshot = {
      summary: String(snapshot?.summary || ''),
      education: Array.isArray(snapshot?.education) ? snapshot.education : [],
      skills: normalizedSkills,
      projects: Array.isArray(snapshot?.projects) ? snapshot.projects : [],
      experience: Array.isArray(snapshot?.experience) ? snapshot.experience : [],
      source: snapshot?.source || { type: versionRow.source_type || 'unknown' },
    }

    upsertResumeParsedSnapshot(db, versionRow.id, snapshot)
    setResumeVersionStatus(db, versionRow.id, { status: status.parsed, parsedAt: nowIso() })

    // First-class skills profile: resume parsing updates user_skills (tenant-scoped).
    try {
      upsertUserSkills(db, {
        tenantId: tenantId || null,
        userId,
        skills: snapshot.skills || [],
        source: 'resume',
        proficiency: 40,
      })
    } catch {
      // best-effort
    }

    // Trigger matching for active targets (best-effort).
    await enqueueTargetMatches({
      userId,
      resumeVersionLabel: versionRow.version_label,
      resumeVersionId: versionRow.id,
      correlationId: job?.data?.correlationId || null,
    })

    logger.info(
      {
        jobId: job.id,
        userId,
        resumeVersion: versionRow.version_label,
        durationMs: Date.now() - started,
      },
      '[worker] resume_processing complete'
    )

    return { ok: true, resumeVersionId: versionRow.id, durationMs: Date.now() - started }
  } catch (err) {
    logger.error({ err, jobId: job?.id, userId }, '[worker] resume_processing failed')
    setResumeVersionStatus(db, versionRow.id, {
      status: status.failed,
      errorText: toPublicError(err, { fallbackMessage: 'Resume parsing failed. Please retry.' }),
    })
    throw err
  }
}
