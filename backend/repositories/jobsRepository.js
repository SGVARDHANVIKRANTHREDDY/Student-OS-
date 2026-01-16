import { getWritePool } from '../lib/pg.js'

export async function createAdminJobDb({
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
    RETURNING tenant_id, id, title, company, location, type, experience_level, created_at, is_active, status, deadline_at, updated_at
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

  return res.rows[0] || null
}

export async function updateJobMarketplaceAdminDbWithLock({ tenantId, jobId, buildUpdate }) {
  const pool = getWritePool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const currentRes = await client.query(
      `SELECT id, status, deadline_at, is_active
       FROM jobs
       WHERE id = $2 AND tenant_id IS NOT DISTINCT FROM $1
       FOR UPDATE`,
      [tenantId, String(jobId)]
    )

    if (currentRes.rowCount === 0) {
      await client.query('ROLLBACK')
      return { ok: false, code: 'NOT_FOUND' }
    }

    const current = currentRes.rows[0]
    const decision = await buildUpdate({ current })

    if (!decision || decision.ok === false) {
      await client.query('ROLLBACK')
      return decision || { ok: false, code: 'INVALID_STATE', message: 'Update rejected' }
    }

    const { sets } = decision
    if (!Array.isArray(sets) || sets.length === 0) {
      await client.query('ROLLBACK')
      return { ok: true, changed: false, previous: current, job: current }
    }

    const params = [tenantId]
    const addParam = (v) => {
      params.push(v)
      return `$${params.length}`
    }

    const statusSet = sets.find((s) => s && s.columnSql === 'status')
    const nextStatus = statusSet ? String(statusSet.value || '').trim().toUpperCase() : ''

    const paramSetClauses = sets
      .map(({ columnSql, value }) => {
        const p = addParam(value)
        return `${columnSql} = ${p}`
      })
    const rawSetClauses = []
    if (nextStatus === 'OPEN') rawSetClauses.push('opened_at = COALESCE(opened_at, NOW())')
    if (nextStatus === 'CLOSED') rawSetClauses.push('closed_at = COALESCE(closed_at, NOW())')
    if (nextStatus === 'ARCHIVED') {
      rawSetClauses.push('archived_at = COALESCE(archived_at, NOW())')
      // Safety: archived implies inactive.
      if (!sets.some((s) => s && s.columnSql === 'is_active')) {
        rawSetClauses.push('is_active = FALSE')
      }
    }

    const setSql = [...paramSetClauses, ...rawSetClauses, 'updated_at = NOW()'].join(', ')

    params.push(String(jobId))

    const updatedRes = await client.query(
      `UPDATE jobs
       SET ${setSql}
       WHERE tenant_id IS NOT DISTINCT FROM $1 AND id = $${params.length}
       RETURNING id, title, company, location, type, experience_level, created_at, is_active, status, deadline_at, updated_at`,
      params
    )

    await client.query('COMMIT')

    return { ok: true, changed: true, previous: current, job: updatedRes.rows[0] }
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
