import { getReadPool, isPgConfigured } from './pg.js'
import { effectiveTenantId } from './tenancy.js'

function clampInt(value, { min, max, fallback }) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
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

export function requirePg(res) {
  if (!isPgConfigured()) {
    res.status(503).json({ message: 'Learning resources database is not configured' })
    return false
  }
  return true
}

export function parseCursorPagination(req) {
  const limit = clampInt(req.query?.limit, { min: 1, max: 50, fallback: 20 })
  const cursor = req.query?.cursor ? String(req.query.cursor).trim() : ''
  if (!cursor) return { limit, cursor: null }

  try {
    const decoded = decodeCursor(cursor)
    const tr = Number(decoded?.tr)
    const ca = String(decoded?.ca || '')
    const id = String(decoded?.id || '')

    if (!Number.isFinite(tr) || !ca || !id) return { limit, cursor: null, cursorError: 'Invalid cursor' }
    return { limit, cursor: { tr: Math.trunc(tr), ca, id } }
  } catch {
    return { limit, cursor: null, cursorError: 'Invalid cursor' }
  }
}

export async function listLearningResourcesCursor({ tenantId, q, limit, cursor }) {
  const pool = getReadPool()
  const tid = effectiveTenantId(tenantId)

  const where = ['lr.tenant_id IS NOT DISTINCT FROM $1']
  const params = [tid]

  let qParamIndex = null
  if (q) {
    params.push(String(q))
    qParamIndex = params.length
    where.push(`lr.search_tsv @@ websearch_to_tsquery('english', $${qParamIndex})`)
  }

  const textRankSql = qParamIndex
    ? `CAST(floor(ts_rank_cd(lr.search_tsv, websearch_to_tsquery('english', $${qParamIndex})) * 1000) AS int)`
    : '0'

  const safeLimit = Math.max(1, Math.min(50, Number(limit || 20)))

  const selectSql = `
    WITH ranked AS (
      SELECT
        lr.id,
        lr.title,
        lr.url,
        lr.created_at,
        lr.updated_at,
        ${textRankSql} AS text_rank
      FROM learning_resources lr
      WHERE ${where.join(' AND ')}
    )
    SELECT *
    FROM ranked
  `

  const cursorWhere = []
  const cursorParams = []
  if (cursor) {
    cursorParams.push(Number(cursor.tr), String(cursor.ca), String(cursor.id))
    const base = params.length
    cursorWhere.push(`(text_rank, created_at, id) < ($${base + 1}::int, $${base + 2}::timestamptz, $${base + 3}::uuid)`)
  }

  const finalSql = `
    ${selectSql}
    ${cursorWhere.length ? `WHERE ${cursorWhere.join(' AND ')}` : ''}
    ORDER BY text_rank DESC, created_at DESC, id DESC
    LIMIT $${params.length + cursorParams.length + 1}
  `

  const res = await pool.query(finalSql, [...params, ...cursorParams, safeLimit])
  const rows = res.rows || []

  const nextCursor =
    rows.length > 0
      ? encodeCursor({
          tr: Number(rows[rows.length - 1].text_rank || 0),
          ca: rows[rows.length - 1].created_at,
          id: rows[rows.length - 1].id,
        })
      : null

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ranking: { textRank: Number(r.text_rank || 0) },
    })),
    nextCursor,
    pageSize: safeLimit,
    hasNext: rows.length === safeLimit,
  }
}
