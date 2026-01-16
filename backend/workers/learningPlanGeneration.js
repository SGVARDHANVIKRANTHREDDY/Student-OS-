import { getDb } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { LEARNING_RULES_VERSION, generateLearningPlanFromMissingSkills } from '../lib/learningPlanEngine.js'

function nowIso() {
  return new Date().toISOString()
}

function getLatestMatch(db, { userId, tenantId, jobId, resumeVersionLabel, algorithmVersion }) {
  return db
    .prepare(
      `SELECT *
       FROM resume_job_matches
       WHERE user_id = ?
         AND tenant_id IS ?
         AND job_id = ?
         AND resume_version_label = ?
         AND algorithm_version = ?
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get(userId, tenantId || null, jobId, resumeVersionLabel, algorithmVersion)
}

function existingPlanForRules(db, { userId, tenantId, jobId, resumeVersionLabel, rulesVersion }) {
  return db
    .prepare(
      `SELECT id, plan_version, status
       FROM learning_plans
       WHERE user_id = ?
         AND tenant_id IS ?
         AND job_id = ?
         AND resume_version_label = ?
         AND rules_version = ?
       ORDER BY plan_version DESC
       LIMIT 1`
    )
    .get(userId, tenantId || null, jobId, resumeVersionLabel, rulesVersion)
}

function nextPlanVersion(db, { userId, tenantId, jobId, resumeVersionLabel }) {
  const row = db
    .prepare(
      `SELECT MAX(plan_version) AS max_v
       FROM learning_plans
       WHERE user_id = ?
         AND tenant_id IS ?
         AND job_id = ?
         AND resume_version_label = ?`
    )
    .get(userId, tenantId || null, jobId, resumeVersionLabel)

  const maxV = Number(row?.max_v || 0)
  return maxV + 1
}

function insertPlanWithItems(db, { userId, tenantId, jobId, resumeVersionLabel, resumeVersionId, planJson }) {
  const now = nowIso()
  const pv = nextPlanVersion(db, { userId, tenantId, jobId, resumeVersionLabel })

  const ins = db
    .prepare(
      `INSERT INTO learning_plans
        (user_id, tenant_id, job_id, resume_version_label, resume_version_id, plan_version, status, rules_version, plan_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`
    )
    .run(
      userId,
      tenantId || null,
      jobId,
      resumeVersionLabel,
      resumeVersionId || null,
      pv,
      LEARNING_RULES_VERSION,
      JSON.stringify(planJson),
      now,
      now
    )

  const planId = ins.lastInsertRowid

  const items = Array.isArray(planJson?.items) ? planJson.items : []
  const stmt = db.prepare(
    `INSERT INTO learning_plan_items
      (learning_plan_id, item_key, title, status, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(learning_plan_id, item_key) DO NOTHING`
  )

  const tx = db.transaction(() => {
    for (const item of items) {
      stmt.run(planId, String(item.key), String(item.title), String(item.status || 'NOT_STARTED'), now)
    }
  })
  tx()

  return { planId, planVersion: pv }
}

export async function processLearningPlan(job) {
  const started = Date.now()
  const { userId, tenantId, jobId, resumeVersion, resumeVersionId, matchAlgorithmVersion } = job.data || {}

  if (!userId) throw new Error('learning_plan_generation: missing userId')
  if (!jobId) throw new Error('learning_plan_generation: missing jobId')
  if (!resumeVersion && !resumeVersionId) throw new Error('learning_plan_generation: missing resumeVersion/resumeVersionId')

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

  if (!versionRow) throw new Error('learning_plan_generation: resume version not found')

  const existing = existingPlanForRules(db, {
    userId,
    tenantId: tenantId || null,
    jobId: String(jobId),
    resumeVersionLabel: versionRow.version_label,
    rulesVersion: LEARNING_RULES_VERSION,
  })

  if (existing?.id && existing.status === 'ACTIVE') {
    return { ok: true, skipped: true, planId: existing.id, durationMs: Date.now() - started }
  }

  const match = getLatestMatch(db, {
    userId,
    tenantId: tenantId || null,
    jobId: String(jobId),
    resumeVersionLabel: versionRow.version_label,
    algorithmVersion: matchAlgorithmVersion || 'v1',
  })

  if (!match) throw new Error('learning_plan_generation: match result not found')

  let missingSkills
  try {
    missingSkills = JSON.parse(match.missing_skills_json || '[]')
  } catch {
    missingSkills = []
  }

  const planJson = generateLearningPlanFromMissingSkills({
    missingSkills,
    jobId: String(jobId),
    resumeVersionLabel: versionRow.version_label,
  })

  const inserted = insertPlanWithItems(db, {
    userId,
    tenantId: tenantId || null,
    jobId: String(jobId),
    resumeVersionLabel: versionRow.version_label,
    resumeVersionId: versionRow.id,
    planJson,
  })

  logger.info(
    {
      jobId: job.id,
      userId,
      resumeVersion: versionRow.version_label,
      targetJobId: jobId,
      planId: inserted.planId,
      planVersion: inserted.planVersion,
      durationMs: Date.now() - started,
    },
    '[worker] learning_plan_generation complete'
  )

  return { ok: true, planId: inserted.planId, planVersion: inserted.planVersion, durationMs: Date.now() - started }
}
