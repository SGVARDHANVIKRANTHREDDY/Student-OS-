import { getDb } from './db.js'

function nowIso() {
  return new Date().toISOString()
}

export function writeAuditLog({
  tenantId = null,
  actorType,
  actorUserId = null,
  action,
  targetType,
  targetId = null,
  metadata = {},
  correlationId = null,
  db = null,
}) {
  const effectiveDb = db || getDb()
  const createdAt = nowIso()

  effectiveDb
    .prepare(
      `INSERT INTO audit_logs
        (tenant_id, actor_type, actor_user_id, action, target_type, target_id, metadata_json, correlation_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      tenantId ? String(tenantId) : null,
      String(actorType),
      actorUserId ? String(actorUserId) : null,
      String(action),
      String(targetType),
      targetId ? String(targetId) : null,
      JSON.stringify(metadata || {}),
      correlationId ? String(correlationId) : null,
      createdAt
    )
}
