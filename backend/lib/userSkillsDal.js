import { effectiveTenantId } from './tenancy.js'

function nowIso() {
  return new Date().toISOString()
}

export function normalizeSkillId(name) {
  const raw = String(name || '').trim().toLowerCase()
  if (!raw) return ''
  // Stable, URL-safe-ish identifier.
  return raw
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 128)
}

function clampProficiency(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.trunc(n)))
}

export function upsertUserSkills(db, { tenantId, userId, skills, source, proficiency }) {
  const tid = effectiveTenantId(tenantId)
  const uid = String(userId)
  const src = String(source || 'manual')
  const baseProf = clampProficiency(proficiency)

  const list = Array.isArray(skills) ? skills : []
  const normalized = list
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .slice(0, 500)

  const now = nowIso()

  const stmt = db.prepare(
    `INSERT INTO user_skills (tenant_id, user_id, normalized_id, name, proficiency, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, user_id, normalized_id) DO UPDATE SET
       name = excluded.name,
       proficiency = CASE WHEN excluded.proficiency > user_skills.proficiency THEN excluded.proficiency ELSE user_skills.proficiency END,
       source = excluded.source,
       updated_at = excluded.updated_at`
  )

  const inserted = []
  for (const name of normalized) {
    const nid = normalizeSkillId(name)
    if (!nid) continue
    stmt.run(tid, uid, nid, name, baseProf, src, now, now)
    inserted.push({ normalizedId: nid, name })
  }

  return { ok: true, count: inserted.length }
}

export function listUserSkills(db, { tenantId, userId }) {
  const tid = effectiveTenantId(tenantId)
  const uid = String(userId)

  const rows = db
    .prepare(
      `SELECT normalized_id, name, proficiency, source, updated_at
       FROM user_skills
       WHERE tenant_id = ? AND user_id = ?
       ORDER BY proficiency DESC, name ASC`
    )
    .all(tid, uid)

  return rows.map((r) => ({
    normalizedId: r.normalized_id,
    name: r.name,
    proficiency: Number(r.proficiency || 0),
    source: r.source,
    updatedAt: r.updated_at,
  }))
}
