import { getReadPool, getWritePool, isPgConfigured } from './pg.js'
import { effectiveTenantId, getTenantIdFromRequest as getTenantFromReq } from './tenancy.js'

function nowUtc() {
  return new Date()
}

function computeDaysLeft(deadlineAt) {
  if (!deadlineAt) return null
  const d = new Date(deadlineAt)
  if (Number.isNaN(d.getTime())) return null
  const diffMs = d.getTime() - nowUtc().getTime()
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000))
  return Math.max(0, days)
}

function normalizeApplicationStatusForWrite(status) {
  const s = String(status || '').trim().toUpperCase()
  if (!s) return ''
  // Backward-compatible: accept OFFERED, but store SELECTED.
  if (s === 'OFFERED') return 'SELECTED'
  return s
}

function normalizeJobStatus(value) {
  const s = String(value || '').trim().toUpperCase()
  return s || ''
}

export const JOB_LIFECYCLE = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
}

export const APPLICATION_STATUS = {
  APPLIED: 'APPLIED',
  SHORTLISTED: 'SHORTLISTED',
  REJECTED: 'REJECTED',
  SELECTED: 'SELECTED',
}

function normalizeJobRowForApi(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    type: row.type,
    experienceLevel: row.experience_level,
    createdAt: row.created_at,
    isActive: row.is_active,
    status: row.status || null,
    deadlineAt: row.deadline_at || null,
    updatedAt: row.updated_at || null,
  }
}

export function getTenantIdFromRequest(req) {
  return effectiveTenantId(getTenantFromReq(req))
}

export function requirePg(res) {
  if (!isPgConfigured()) {
    res.status(503).json({ message: 'Jobs are temporarily unavailable. Please try again later.' })
    return false
  }
  return true
}

function clampInt(value, { min, max, fallback }) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

export function parsePagination(req) {
  const page = clampInt(req.query?.page, { min: 1, max: 10_000, fallback: 1 })
  const pageSize = clampInt(req.query?.pageSize, { min: 1, max: 50, fallback: 20 })
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export async function listJobs({ tenantId, userId, filters, page, pageSize, offset }) {
  const pool = getReadPool()

  const where = [
    'j.is_active = TRUE',
    'j.tenant_id IS NOT DISTINCT FROM $1',
    "j.status IN ('OPEN','CLOSED')",
  ]
  const baseParams = [tenantId]

  if (filters.type) {
    baseParams.push(filters.type)
    where.push(`j.type = $${baseParams.length}`)
  }
  if (filters.location) {
    baseParams.push(filters.location)
    where.push(`j.location = $${baseParams.length}`)
  }
  if (filters.experienceLevel) {
    baseParams.push(filters.experienceLevel)
    where.push(`j.experience_level = $${baseParams.length}`)
  }
  if (filters.q) {
    baseParams.push(filters.q)
    where.push(`j.search_tsv @@ websearch_to_tsquery('english', $${baseParams.length})`)
  }

  // userId for saved join
  const userIdParam = baseParams.length + 1

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM jobs j
    WHERE ${where.join(' AND ')}
  `

  const listSql = `
    SELECT
      j.id,
      j.title,
      j.company,
      j.location,
      j.type,
      j.experience_level,
      j.created_at,
      j.is_active,
      j.status,
      j.deadline_at,
      (SELECT COUNT(*)::int FROM applications a WHERE a.job_id = j.id AND a.tenant_id IS NOT DISTINCT FROM $1) AS applicant_count,
      (sj.user_id IS NOT NULL) AS is_saved
    FROM jobs j
    LEFT JOIN saved_jobs sj
      ON sj.job_id = j.id
      AND sj.user_id = $${userIdParam}
      AND sj.tenant_id IS NOT DISTINCT FROM $1
    WHERE ${where.join(' AND ')}
    ORDER BY j.created_at DESC
    LIMIT $${userIdParam + 1} OFFSET $${userIdParam + 2}
  `

  const countRes = await pool.query(countSql, baseParams)

  const listParams = [...baseParams, userId, pageSize, offset]
  const itemsRes = await pool.query(listSql, listParams)

  return {
    total: countRes.rows[0]?.total || 0,
    items: itemsRes.rows.map((r) => ({
      id: r.id,
      title: r.title,
      company: r.company,
      location: r.location,
      type: r.type,
      experienceLevel: r.experience_level,
      createdAt: r.created_at,
      isActive: r.is_active,
      isSaved: !!r.is_saved,
      // additive marketplace fields
      status: r.status || null,
      deadlineAt: r.deadline_at || null,
      applicantCount: Number(r.applicant_count || 0),
      daysLeft: computeDaysLeft(r.deadline_at),
    })),
    page,
    pageSize,
    hasNext: offset + pageSize < (countRes.rows[0]?.total || 0),
  }
}

function encodeCursor(value) {
  const json = JSON.stringify(value || {})
  return Buffer.from(json, 'utf8').toString('base64url')
}

function decodeCursor(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const json = Buffer.from(raw, 'base64url').toString('utf8')
  const obj = JSON.parse(json)
  return obj && typeof obj === 'object' ? obj : null
}

export function parseCursorPagination(req) {
  const limit = clampInt(req.query?.limit, { min: 1, max: 50, fallback: 20 })
  const cursor = req.query?.cursor ? String(req.query.cursor).trim() : ''
  if (!cursor) return { mode: 'cursor', limit, cursor: null }

  try {
    const decoded = decodeCursor(cursor)
    if (!decoded) return { mode: 'cursor', limit, cursor: null, cursorError: 'Invalid cursor' }

    const tr = Number(decoded.tr)
    const ms = Number(decoded.ms)
    const ca = String(decoded.ca || '')
    const id = String(decoded.id || '')

    if (!Number.isFinite(tr) || !Number.isFinite(ms) || !ca || !id) {
      return { mode: 'cursor', limit, cursor: null, cursorError: 'Invalid cursor' }
    }

    return { mode: 'cursor', limit, cursor: { tr: Math.trunc(tr), ms: Math.trunc(ms), ca, id } }
  } catch {
    return { mode: 'cursor', limit, cursor: null, cursorError: 'Invalid cursor' }
  }
}

export async function listJobsCursor({ tenantId, userId, filters, limit, cursor }) {
  const pool = getReadPool()

  const where = [
    'j.is_active = TRUE',
    'j.tenant_id IS NOT DISTINCT FROM $1',
    "j.status IN ('OPEN','CLOSED')",
  ]
  const params = [tenantId]

  if (filters.type) {
    params.push(filters.type)
    where.push(`j.type = $${params.length}`)
  }
  if (filters.location) {
    params.push(filters.location)
    where.push(`j.location = $${params.length}`)
  }
  if (filters.experienceLevel) {
    params.push(filters.experienceLevel)
    where.push(`j.experience_level = $${params.length}`)
  }

  let qParamIndex = null
  if (filters.q) {
    params.push(filters.q)
    qParamIndex = params.length
    where.push(`j.search_tsv @@ websearch_to_tsquery('english', $${qParamIndex})`)
  }

  params.push(userId)
  const userIdParamIndex = params.length

  const safeLimit = Math.max(1, Math.min(50, Number(limit || 20)))

  // Deterministic ranking tuple:
  // 1) text relevance (int)  2) match score  3) recency  4) id
  // Cursor is a serialized copy of the last row's tuple.
  const textRankSql = qParamIndex
    ? `CAST(floor(ts_rank_cd(j.search_tsv, websearch_to_tsquery('english', $${qParamIndex})) * 1000) AS int)`
    : '0'

  const selectSql = `
    WITH ranked AS (
      SELECT
        j.id,
        j.title,
        j.company,
        j.location,
        j.type,
        j.experience_level,
        j.created_at,
        j.is_active,
        j.status,
        j.deadline_at,
        (sj.user_id IS NOT NULL) AS is_saved,
        COALESCE(ms.score, 0) AS match_score,
        ${textRankSql} AS text_rank
      FROM jobs j
      LEFT JOIN saved_jobs sj
        ON sj.job_id = j.id
        AND sj.user_id = $${userIdParamIndex}
        AND sj.tenant_id IS NOT DISTINCT FROM $1
      LEFT JOIN job_match_scores ms
        ON ms.job_id = j.id
        AND ms.user_id = $${userIdParamIndex}
        AND ms.tenant_id IS NOT DISTINCT FROM $1
      WHERE ${where.join(' AND ')}
    )
    SELECT *
    FROM ranked
  `

  const cursorWhere = []
  const cursorParams = []
  if (cursor) {
    cursorParams.push(Number(cursor.tr), Number(cursor.ms), String(cursor.ca), String(cursor.id))
    const base = params.length
    cursorWhere.push(
      `(text_rank, match_score, created_at, id) < ($${base + 1}::int, $${base + 2}::int, $${base + 3}::timestamptz, $${base + 4}::uuid)`
    )
  }

  const finalSql = `
    ${selectSql}
    ${cursorWhere.length ? `WHERE ${cursorWhere.join(' AND ')}` : ''}
    ORDER BY text_rank DESC, match_score DESC, created_at DESC, id DESC
    LIMIT $${params.length + cursorParams.length + 1}
  `

  const res = await pool.query(finalSql, [...params, ...cursorParams, safeLimit])
  const rows = res.rows || []

  const nextCursor =
    rows.length > 0
      ? encodeCursor({
          tr: Number(rows[rows.length - 1].text_rank || 0),
          ms: Number(rows[rows.length - 1].match_score || 0),
          ca: rows[rows.length - 1].created_at,
          id: rows[rows.length - 1].id,
        })
      : null

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      company: r.company,
      location: r.location,
      type: r.type,
      experienceLevel: r.experience_level,
      createdAt: r.created_at,
      isActive: r.is_active,
      isSaved: !!r.is_saved,
      status: r.status || null,
      deadlineAt: r.deadline_at || null,
      daysLeft: computeDaysLeft(r.deadline_at),
      // additive: can be used by clients for explainability
      ranking: {
        textRank: Number(r.text_rank || 0),
        matchScore: Number(r.match_score || 0),
      },
    })),
    nextCursor,
    pageSize: safeLimit,
    hasNext: rows.length === safeLimit,
  }
}

export async function listApplicationsAdmin({ tenantId, jobId = null, status = null, limit = 100, offset = 0 }) {
  const pool = getReadPool()
  const safeLimit = Math.min(Math.max(Number(limit || 100), 1), 500)
  const safeOffset = Math.max(Number(offset || 0), 0)
  const statusValue = status ? String(status).trim().toUpperCase() : null

  const where = ['a.tenant_id IS NOT DISTINCT FROM $1']
  const params = [tenantId]

  if (jobId) {
    params.push(String(jobId))
    where.push(`a.job_id = $${params.length}`)
  }
  if (statusValue) {
    params.push(statusValue)
    where.push(`a.status = $${params.length}`)
  }

  params.push(safeLimit)
  params.push(safeOffset)

  const sql = `
    SELECT
      a.id,
      a.job_id,
      a.user_id,
      a.status,
      a.created_at,
      a.updated_at
    FROM applications a
    WHERE ${where.join(' AND ')}
    ORDER BY a.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `

  const result = await pool.query(sql, params)
  return result.rows
}

export async function updateApplicationStatusAdmin({ tenantId, applicationId, status }) {
  const pool = getWritePool()
  const statusValue = normalizeApplicationStatusForWrite(status)
  if (!statusValue) {
    const err = new Error('status is required')
    err.code = 'BAD_REQUEST'
    throw err
  }

  // Allow legacy statuses to avoid breaking existing clients.
  const allowed = new Set(['APPLIED', 'SELECTED', 'REJECTED', 'SHORTLISTED', 'OFFERED'])
  if (!allowed.has(String(status || '').trim().toUpperCase())) {
    const err = new Error('Invalid status')
    err.code = 'BAD_REQUEST'
    throw err
  }

  const result = await pool.query(
    `WITH prev AS (
       SELECT status
       FROM applications
       WHERE id = $2 AND tenant_id IS NOT DISTINCT FROM $3
       FOR UPDATE
     )
     UPDATE applications
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id IS NOT DISTINCT FROM $3
     RETURNING id, job_id, user_id, status, created_at, updated_at,
               (SELECT status FROM prev) AS previous_status`,
    [statusValue, String(applicationId), tenantId]
  )

  const r = result.rows[0]
  if (!r) return null
  return {
    id: r.id,
    job_id: r.job_id,
    user_id: r.user_id,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    previous_status: r.previous_status,
  }
}

export async function upsertJobMatchScore({ tenantId, userId, jobId, algorithmVersion, score }) {
  const pool = getWritePool()
  const tid = effectiveTenantId(tenantId)
  const s = Math.max(0, Math.min(100, Math.trunc(Number(score) || 0)))
  const av = String(algorithmVersion || '').trim() || 'v1'

  const sql = `
    INSERT INTO job_match_scores (tenant_id, user_id, job_id, algorithm_version, score, updated_at)
    VALUES ($1::uuid, $2, $3::uuid, $4, $5::int, NOW())
    ON CONFLICT (tenant_id, user_id, job_id) DO UPDATE
      SET algorithm_version = excluded.algorithm_version,
          score = excluded.score,
          updated_at = excluded.updated_at
  `

  await pool.query(sql, [tid, String(userId), String(jobId), av, s])
  return { ok: true }
}

export async function getJobById({ tenantId, userId, jobId }) {
  const pool = getReadPool()
  const sql = `
    SELECT
      j.id,
      j.title,
      j.company,
      j.location,
      j.type,
      j.experience_level,
      j.description,
      j.requirements,
      j.created_at,
      j.is_active,
      j.status,
      j.deadline_at,
      (SELECT COUNT(*)::int FROM applications a WHERE a.job_id = j.id AND a.tenant_id IS NOT DISTINCT FROM $1) AS applicant_count,
      (sj.user_id IS NOT NULL) AS is_saved
    FROM jobs j
    LEFT JOIN saved_jobs sj
      ON sj.job_id = j.id
      AND sj.user_id = $3
      AND sj.tenant_id IS NOT DISTINCT FROM $1
    WHERE j.id = $2
      AND j.is_active = TRUE
      AND j.status IN ('OPEN','CLOSED')
      AND j.tenant_id IS NOT DISTINCT FROM $1
    LIMIT 1
  `

  const res = await pool.query(sql, [tenantId, jobId, userId])
  const r = res.rows[0]
  if (!r) return null

  return {
    id: r.id,
    title: r.title,
    company: r.company,
    location: r.location,
    type: r.type,
    experienceLevel: r.experience_level,
    description: r.description,
    requirements: r.requirements,
    createdAt: r.created_at,
    isActive: r.is_active,
    isSaved: !!r.is_saved,
    status: r.status || null,
    deadlineAt: r.deadline_at || null,
    applicantCount: Number(r.applicant_count || 0),
    daysLeft: computeDaysLeft(r.deadline_at),
  }
}

export async function saveJob({ tenantId, userId, jobId }) {
  const pool = getWritePool()
  // ensure job exists and active
  const jobCheck = await pool.query(
    'SELECT id FROM jobs WHERE id = $2 AND is_active = TRUE AND tenant_id IS NOT DISTINCT FROM $1',
    [tenantId, jobId]
  )
  if (jobCheck.rowCount === 0) return { ok: false, code: 'NOT_FOUND' }

  await pool.query(
    `INSERT INTO saved_jobs (user_id, job_id, tenant_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, job_id) DO UPDATE SET saved_at = NOW()`,
    [userId, jobId, tenantId]
  )
  return { ok: true }
}

export async function unsaveJob({ tenantId, userId, jobId }) {
  const pool = getWritePool()
  await pool.query(
    'DELETE FROM saved_jobs WHERE user_id = $1 AND job_id = $2 AND tenant_id IS NOT DISTINCT FROM $3',
    [userId, jobId, tenantId]
  )
  return { ok: true }
}

export async function createApplication({ tenantId, userId, jobId, resumeVersion }) {
  const pool = getWritePool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const jobRes = await client.query(
      `SELECT id, status, deadline_at
       FROM jobs
       WHERE id = $2 AND is_active = TRUE AND tenant_id IS NOT DISTINCT FROM $1`,
      [tenantId, jobId]
    )
    if (jobRes.rowCount === 0) {
      await client.query('ROLLBACK')
      return { ok: false, code: 'JOB_NOT_FOUND' }
    }

    const job = jobRes.rows[0]
    const jobStatus = normalizeJobStatus(job.status)
    if (jobStatus && jobStatus !== JOB_LIFECYCLE.OPEN) {
      await client.query('ROLLBACK')
      return { ok: false, code: 'JOB_NOT_OPEN', message: `Applications are not open for this job (status: ${jobStatus}).` }
    }
    if (job.deadline_at) {
      const deadline = new Date(job.deadline_at)
      if (!Number.isNaN(deadline.getTime()) && deadline.getTime() <= nowUtc().getTime()) {
        await client.query('ROLLBACK')
        return { ok: false, code: 'DEADLINE_PASSED', message: 'Applications are closed for this job (deadline passed).' }
      }
    }

    const insertSql = `
      INSERT INTO applications (user_id, job_id, tenant_id, resume_version, status)
      VALUES ($1, $2, $3, $4, 'APPLIED')
      RETURNING id, user_id, job_id, resume_version, status, applied_at, updated_at
    `

    const ins = await client.query(insertSql, [userId, jobId, tenantId, resumeVersion])

    await client.query('COMMIT')
    const r = ins.rows[0]
    return {
      ok: true,
      application: {
        id: r.id,
        userId: r.user_id,
        jobId: r.job_id,
        resumeVersion: r.resume_version,
        status: r.status,
        appliedAt: r.applied_at,
        updatedAt: r.updated_at,
      },
    }
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }

    // Unique violation => duplicate application
    if (err?.code === '23505') {
      return { ok: false, code: 'DUPLICATE' }
    }

    throw err
  } finally {
    client.release()
  }
}

export async function autoRejectExpiredApplications({ tenantId, jobId = null }) {
  const pool = getWritePool()
  const tid = effectiveTenantId(tenantId)
  const params = [tid]
  let jobFilterSql = ''
  if (jobId) {
    params.push(String(jobId))
    jobFilterSql = ` AND j.id = $${params.length}`
  }

  // Reject APPLIED/SHORTLISTED once deadline passes.
  // Returns the rows that changed so callers can emit notifications/audit.
  const sql = `
    WITH eligible AS (
      SELECT a.id AS application_id, a.user_id, a.job_id, a.status AS previous_status
      FROM applications a
      JOIN jobs j
        ON j.id = a.job_id
        AND j.tenant_id IS NOT DISTINCT FROM a.tenant_id
      WHERE a.tenant_id IS NOT DISTINCT FROM $1
        AND a.status IN ('APPLIED','SHORTLISTED')
        AND j.deadline_at IS NOT NULL
        AND j.deadline_at <= NOW()
        ${jobFilterSql}
    )
    UPDATE applications a
    SET status = 'REJECTED', updated_at = NOW()
    FROM eligible e
    WHERE a.id = e.application_id
    RETURNING a.id, a.user_id, a.job_id, a.status, a.updated_at, e.previous_status
  `

  const res = await pool.query(sql, params)
  return res.rows || []
}

export async function listApplications({ tenantId, userId, page, pageSize, offset }) {
  const pool = getReadPool()

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM applications a
     WHERE a.user_id = $1
       AND a.tenant_id IS NOT DISTINCT FROM $2`,
    [userId, tenantId]
  )

  const res = await pool.query(
    `
    SELECT
      a.id,
      a.user_id,
      a.job_id,
      a.resume_version,
      a.status,
      a.applied_at,
      a.updated_at,
      j.title,
      j.company,
      j.location,
      j.type,
      j.experience_level
    FROM applications a
    JOIN jobs j
      ON j.id = a.job_id
      AND j.tenant_id IS NOT DISTINCT FROM a.tenant_id
    WHERE a.user_id = $1
      AND a.tenant_id IS NOT DISTINCT FROM $2
    ORDER BY a.applied_at DESC
    LIMIT $3 OFFSET $4
    `,
    [userId, tenantId, pageSize, offset]
  )

  const total = countRes.rows[0]?.total || 0

  return {
    total,
    items: res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      jobId: r.job_id,
      resumeVersion: r.resume_version,
      status: r.status,
      appliedAt: r.applied_at,
      updatedAt: r.updated_at,
      job: {
        id: r.job_id,
        title: r.title,
        company: r.company,
        location: r.location,
        type: r.type,
        experienceLevel: r.experience_level,
      },
    })),
    page,
    pageSize,
    hasNext: offset + pageSize < total,
  }
}

export async function updateJobMarketplaceAdmin({ tenantId, jobId, patch }) {
  const pool = getWritePool()
  const id = String(jobId || '').trim()
  if (!id) {
    const err = new Error('jobId is required')
    err.code = 'BAD_REQUEST'
    throw err
  }

  const nextStatusRaw = patch?.status !== undefined ? String(patch.status).trim().toUpperCase() : null
  const nextStatus = nextStatusRaw ? normalizeJobStatus(nextStatusRaw) : null

  const deadlineAt = patch?.deadlineAt !== undefined ? patch.deadlineAt : undefined
  let deadlineIso = undefined
  if (deadlineAt !== undefined) {
    if (deadlineAt === null || deadlineAt === '') {
      deadlineIso = null
    } else {
      const d = new Date(deadlineAt)
      if (Number.isNaN(d.getTime())) {
        const err = new Error('deadlineAt must be an ISO timestamp')
        err.code = 'BAD_REQUEST'
        throw err
      }
      deadlineIso = d.toISOString()
    }
  }

  const title = patch?.title !== undefined ? String(patch.title || '').trim() : undefined
  const company = patch?.company !== undefined ? String(patch.company || '').trim() : undefined
  const location = patch?.location !== undefined ? String(patch.location || '').trim() : undefined
  const description = patch?.description !== undefined ? String(patch.description || '').trim() : undefined
  const requirements = patch?.requirements !== undefined ? String(patch.requirements || '').trim() : undefined
  const skills = patch?.skills !== undefined ? (Array.isArray(patch.skills) ? patch.skills : []) : undefined

  const experienceMin = patch?.experienceMin !== undefined ? patch.experienceMin : undefined
  const experienceMax = patch?.experienceMax !== undefined ? patch.experienceMax : undefined

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const currentRes = await client.query(
      `SELECT id, status, deadline_at, is_active
       FROM jobs
       WHERE id = $2 AND tenant_id IS NOT DISTINCT FROM $1
       FOR UPDATE`,
      [tenantId, id]
    )

    if (currentRes.rowCount === 0) {
      await client.query('ROLLBACK')
      return { ok: false, code: 'NOT_FOUND' }
    }

    const current = currentRes.rows[0]
    const currentStatus = normalizeJobStatus(current.status)
    if (currentStatus === JOB_LIFECYCLE.ARCHIVED) {
      await client.query('ROLLBACK')
      return { ok: false, code: 'READ_ONLY', message: 'Archived jobs are read-only.' }
    }

    // CLOSED jobs are read-only (except lifecycle transitions).
    const editingFieldsRequested =
      title !== undefined ||
      company !== undefined ||
      location !== undefined ||
      description !== undefined ||
      requirements !== undefined ||
      skills !== undefined ||
      experienceMin !== undefined ||
      experienceMax !== undefined ||
      deadlineIso !== undefined

    if (currentStatus === JOB_LIFECYCLE.CLOSED && editingFieldsRequested) {
      await client.query('ROLLBACK')
      return { ok: false, code: 'READ_ONLY', message: 'Closed jobs are read-only.' }
    }

    // Validate lifecycle transition if requested.
    if (nextStatus) {
      const allowedTransitions = new Map([
        [JOB_LIFECYCLE.DRAFT, new Set([JOB_LIFECYCLE.OPEN, JOB_LIFECYCLE.ARCHIVED])],
        [JOB_LIFECYCLE.OPEN, new Set([JOB_LIFECYCLE.CLOSED, JOB_LIFECYCLE.ARCHIVED])],
        [JOB_LIFECYCLE.CLOSED, new Set([JOB_LIFECYCLE.OPEN, JOB_LIFECYCLE.ARCHIVED])],
        [JOB_LIFECYCLE.ARCHIVED, new Set([])],
      ])

      const allowed = allowedTransitions.get(currentStatus) || new Set()
      if (!allowed.has(nextStatus)) {
        await client.query('ROLLBACK')
        return {
          ok: false,
          code: 'INVALID_TRANSITION',
          message: `Invalid job status transition: ${currentStatus} -> ${nextStatus}`,
        }
      }
    }

    const sets = []
    const params = [tenantId]
    const addSet = (sql, value) => {
      params.push(value)
      sets.push(sql.replace('$X', `$${params.length}`))
    }

    if (title !== undefined) addSet('title = $X', title)
    if (company !== undefined) addSet('company = $X', company)
    if (location !== undefined) addSet('location = $X', location)
    if (description !== undefined) addSet('description = $X', description)
    if (requirements !== undefined) addSet('requirements = $X', requirements)
    if (skills !== undefined) addSet('skills = $X', skills)
    if (experienceMin !== undefined) addSet('experience_min = $X', experienceMin)
    if (experienceMax !== undefined) addSet('experience_max = $X', experienceMax)
    if (deadlineIso !== undefined) addSet('deadline_at = $X', deadlineIso)
    if (nextStatus) addSet('status = $X', nextStatus)

    // lifecycle timestamps
    if (nextStatus === JOB_LIFECYCLE.OPEN) sets.push('opened_at = COALESCE(opened_at, NOW())')
    if (nextStatus === JOB_LIFECYCLE.CLOSED) sets.push('closed_at = COALESCE(closed_at, NOW())')
    if (nextStatus === JOB_LIFECYCLE.ARCHIVED) {
      sets.push('archived_at = COALESCE(archived_at, NOW())')
      sets.push('is_active = FALSE')
    }

    sets.push('updated_at = NOW()')

    if (sets.length === 0) {
      await client.query('ROLLBACK')
      return { ok: true, changed: false, previous: current, job: normalizeJobRowForApi(current) }
    }

    params.push(id)
    const idParam = params.length

    const updatedRes = await client.query(
      `UPDATE jobs
       SET ${sets.join(', ')}
       WHERE tenant_id IS NOT DISTINCT FROM $1 AND id = $${idParam}
       RETURNING id, title, company, location, type, experience_level, created_at, is_active, status, deadline_at, updated_at`,
      params
    )

    await client.query('COMMIT')
    return { ok: true, changed: true, previous: current, job: normalizeJobRowForApi(updatedRes.rows[0]) }
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw err
  } finally {
    client.release()
  }
}

export async function createAdminJob({
  tenantId,
  title,
  company,
  location,
  type,
  experienceLevel,
  experienceMin,
  experienceMax,
  description,
  requirements,
  skills,
  isActive,
}) {
  const pool = getWritePool()

  const res = await pool.query(
    `
    INSERT INTO jobs (
      tenant_id,
      title,
      company,
      location,
      type,
      experience_level,
      description,
      requirements,
      experience_min,
      experience_max,
      skills,
      is_active
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
    )
    RETURNING id, title, company, location, type, experience_level, created_at, is_active
    `,
    [
      tenantId,
      title,
      company,
      location,
      type,
      experienceLevel,
      description,
      requirements,
      experienceMin,
      experienceMax,
      skills,
      isActive,
    ]
  )

  const r = res.rows[0]
  return {
    id: r.id,
    title: r.title,
    company: r.company,
    location: r.location,
    type: r.type,
    experienceLevel: r.experience_level,
    createdAt: r.created_at,
    isActive: r.is_active,
  }
}
