import { effectiveTenantId } from '../lib/tenancy.js'
import { getReadPool, getWritePool } from '../lib/pg.js'

export async function createApplicationDb({ tenantId, userId, jobId, resumeVersion }) {
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

    const insertSql = `
      INSERT INTO applications (user_id, job_id, tenant_id, resume_version, status)
      VALUES ($1, $2, $3, $4, 'APPLIED')
      RETURNING id, user_id, job_id, resume_version, status, applied_at, updated_at
    `

    const ins = await client.query(insertSql, [String(userId), String(jobId), tenantId, String(resumeVersion)])

    await client.query('COMMIT')
    return { ok: true, job, applicationRow: ins.rows[0] }
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

export async function listApplicationsDb({ tenantId, userId, pageSize, offset }) {
  const pool = getReadPool()

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM applications a
     WHERE a.user_id = $1
       AND a.tenant_id IS NOT DISTINCT FROM $2`,
    [String(userId), tenantId]
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
    [String(userId), tenantId, Number(pageSize), Number(offset)]
  )

  return { total: countRes.rows[0]?.total || 0, rows: res.rows || [] }
}

export async function listApplicationsAdminDb({ tenantId, jobId = null, status = null, limit = 100, offset = 0 }) {
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
  return result.rows || []
}

export async function updateApplicationStatusAdminDb({ tenantId, applicationId, nextStatusValue }) {
  const pool = getWritePool()

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
    [String(nextStatusValue), String(applicationId), tenantId]
  )

  return result.rows[0] || null
}

export async function autoRejectExpiredApplicationsDb({ tenantId, jobId = null }) {
  const pool = getWritePool()
  const tid = effectiveTenantId(tenantId)
  const params = [tid]
  let jobFilterSql = ''
  if (jobId) {
    params.push(String(jobId))
    jobFilterSql = ` AND j.id = $${params.length}`
  }

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
