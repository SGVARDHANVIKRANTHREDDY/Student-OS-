import { getReadPool, getWritePool, isPgConfigured } from './pg.js'

export function requirePg(res) {
  if (!isPgConfigured()) {
    res.status(503).json({ message: 'Jobs are temporarily unavailable. Please try again later.' })
    return false
  }
  return true
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeString(value) {
  return String(value || '').trim()
}

function parseIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return NaN
  return Math.trunc(n)
}

export function validatePostingInput(input) {
  const title = normalizeString(input?.title)
  const company = normalizeString(input?.company)
  const location = normalizeString(input?.location) || 'Remote'
  const type = normalizeString(input?.type)
  const experienceLevel = normalizeString(input?.experienceLevel)
  const experienceMin = parseIntOrNull(input?.experienceMin)
  const experienceMax = parseIntOrNull(input?.experienceMax)
  const description = normalizeString(input?.description)
  const requirements = normalizeString(input?.requirements)

  const rawSkills = input?.skills
  const skills = Array.isArray(rawSkills) ? rawSkills.map((s) => normalizeString(s)).filter(Boolean).slice(0, 200) : []

  if (!title) return { ok: false, message: 'title is required' }
  if (!company) return { ok: false, message: 'company is required' }
  if (!type || !['job', 'internship'].includes(type)) return { ok: false, message: "type must be 'job' or 'internship'" }
  if (!experienceLevel) return { ok: false, message: 'experienceLevel is required' }
  if (Number.isNaN(experienceMin) || Number.isNaN(experienceMax)) return { ok: false, message: 'experienceMin/experienceMax must be integers' }
  if (experienceMin !== null && experienceMin < 0) return { ok: false, message: 'experienceMin must be >= 0' }
  if (experienceMax !== null && experienceMax < 0) return { ok: false, message: 'experienceMax must be >= 0' }
  if (experienceMin !== null && experienceMax !== null && experienceMin > experienceMax) {
    return { ok: false, message: 'experienceMin cannot exceed experienceMax' }
  }
  if (!description) return { ok: false, message: 'description is required' }
  if (!requirements) return { ok: false, message: 'requirements is required' }

  return {
    ok: true,
    value: {
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
    },
  }
}

export async function createJobPosting({ tenantId, userId, actorRole, input }) {
  const pool = getWritePool()
  const v = validatePostingInput(input)
  if (!v.ok) return { ok: false, code: 'VALIDATION', message: v.message }

  const sql = `
    INSERT INTO job_postings (
      tenant_id, created_by_user_id, actor_role, status,
      title, company, location, type, experience_level, experience_min, experience_max,
      description, requirements, skills,
      created_at, updated_at
    ) VALUES (
      $1::uuid, $2, $3, 'DRAFT',
      $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13,
      NOW(), NOW()
    )
    RETURNING id, status, created_at, updated_at
  `

  const r = v.value
  const res = await pool.query(sql, [
    tenantId,
    String(userId),
    String(actorRole),
    r.title,
    r.company,
    r.location,
    r.type,
    r.experienceLevel,
    r.experienceMin,
    r.experienceMax,
    r.description,
    r.requirements,
    r.skills,
  ])

  return { ok: true, postingId: res.rows[0].id, status: res.rows[0].status }
}

export async function updateJobPostingDraft({ tenantId, userId, postingId, input }) {
  const pool = getWritePool()
  const v = validatePostingInput(input)
  if (!v.ok) return { ok: false, code: 'VALIDATION', message: v.message }

  const r = v.value
  const sql = `
    UPDATE job_postings
    SET
      title = $4,
      company = $5,
      location = $6,
      type = $7,
      experience_level = $8,
      experience_min = $9,
      experience_max = $10,
      description = $11,
      requirements = $12,
      skills = $13,
      updated_at = NOW()
    WHERE id = $2::uuid
      AND tenant_id = $1::uuid
      AND created_by_user_id = $3
      AND status = 'DRAFT'
    RETURNING id
  `

  const res = await pool.query(sql, [
    tenantId,
    postingId,
    String(userId),
    r.title,
    r.company,
    r.location,
    r.type,
    r.experienceLevel,
    r.experienceMin,
    r.experienceMax,
    r.description,
    r.requirements,
    r.skills,
  ])

  if (res.rowCount === 0) return { ok: false, code: 'NOT_FOUND_OR_LOCKED' }
  return { ok: true }
}

export async function submitJobPosting({ tenantId, userId, postingId }) {
  const pool = getWritePool()
  const sql = `
    UPDATE job_postings
    SET status = 'SUBMITTED', submitted_at = NOW(), updated_at = NOW()
    WHERE id = $2::uuid
      AND tenant_id = $1::uuid
      AND created_by_user_id = $3
      AND status = 'DRAFT'
    RETURNING id
  `
  const res = await pool.query(sql, [tenantId, postingId, String(userId)])
  if (res.rowCount === 0) return { ok: false, code: 'NOT_FOUND_OR_LOCKED' }
  return { ok: true }
}

export async function listMyJobPostings({ tenantId, userId, limit = 50 }) {
  const pool = getReadPool()
  const effectiveLimit = Math.max(1, Math.min(200, Number(limit || 50)))

  const res = await pool.query(
    `SELECT id, status, title, company, location, type, experience_level, created_at, updated_at, submitted_at, reviewed_at, review_reason, published_job_id
     FROM job_postings
     WHERE tenant_id = $1::uuid AND created_by_user_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [tenantId, String(userId), effectiveLimit]
  )

  return {
    items: res.rows.map((r) => ({
      id: r.id,
      status: r.status,
      title: r.title,
      company: r.company,
      location: r.location,
      type: r.type,
      experienceLevel: r.experience_level,
      submittedAt: r.submitted_at,
      reviewedAt: r.reviewed_at,
      reviewReason: r.review_reason,
      publishedJobId: r.published_job_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  }
}

export async function listSubmittedPostings({ tenantId, status = 'SUBMITTED', limit = 50 }) {
  const pool = getReadPool()
  const effectiveLimit = Math.max(1, Math.min(200, Number(limit || 50)))

  const st = String(status || 'SUBMITTED').trim().toUpperCase()
  const allowed = ['SUBMITTED', 'APPROVED', 'REJECTED', 'ARCHIVED', 'DRAFT']
  const effective = allowed.includes(st) ? st : 'SUBMITTED'

  const res = await pool.query(
    `SELECT id, status, created_by_user_id, actor_role, title, company, location, type, experience_level, submitted_at, created_at, updated_at
     FROM job_postings
     WHERE tenant_id = $1::uuid AND status = $2
     ORDER BY submitted_at DESC NULLS LAST, created_at DESC
     LIMIT $3`,
    [tenantId, effective, effectiveLimit]
  )

  return { items: res.rows }
}

export async function reviewJobPosting({ tenantId, postingId, reviewerUserId, decision, reason = '' }) {
  const pool = getWritePool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const postingRes = await client.query(
      `SELECT * FROM job_postings WHERE id = $2::uuid AND tenant_id = $1::uuid FOR UPDATE`,
      [tenantId, postingId]
    )

    const posting = postingRes.rows[0]
    if (!posting) {
      await client.query('ROLLBACK')
      return { ok: false, code: 'NOT_FOUND' }
    }

    if (posting.status !== 'SUBMITTED') {
      await client.query('ROLLBACK')
      return { ok: false, code: 'NOT_SUBMITTED' }
    }

    const dec = String(decision || '').toUpperCase()
    if (!['APPROVE', 'REJECT'].includes(dec)) {
      await client.query('ROLLBACK')
      return { ok: false, code: 'VALIDATION', message: 'decision must be APPROVE or REJECT' }
    }

    if (dec === 'REJECT') {
      await client.query(
        `UPDATE job_postings
         SET status = 'REJECTED', reviewed_by_user_id = $3, reviewed_at = NOW(), review_reason = $4, updated_at = NOW()
         WHERE id = $2::uuid AND tenant_id = $1::uuid`,
        [tenantId, postingId, String(reviewerUserId), normalizeString(reason).slice(0, 2000) || 'Rejected']
      )
      await client.query('COMMIT')
      return { ok: true, status: 'REJECTED' }
    }

    // APPROVE: publish into jobs table to keep existing read APIs stable.
    const jobIns = await client.query(
      `INSERT INTO jobs
        (tenant_id, title, company, location, type, experience_level, description, requirements, is_active, experience_min, experience_max, skills)
       VALUES
        ($1::uuid, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $10, $11)
       RETURNING id`,
      [
        tenantId,
        posting.title,
        posting.company,
        posting.location,
        posting.type,
        posting.experience_level,
        posting.description,
        posting.requirements,
        posting.experience_min,
        posting.experience_max,
        posting.skills,
      ]
    )

    const publishedJobId = jobIns.rows[0].id

    await client.query(
      `UPDATE job_postings
       SET status = 'APPROVED', reviewed_by_user_id = $3, reviewed_at = NOW(), review_reason = NULL, published_job_id = $4, updated_at = NOW()
       WHERE id = $2::uuid AND tenant_id = $1::uuid`,
      [tenantId, postingId, String(reviewerUserId), publishedJobId]
    )

    await client.query('COMMIT')
    return { ok: true, status: 'APPROVED', publishedJobId }
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
