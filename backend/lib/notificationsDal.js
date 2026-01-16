function nowIso() {
  return new Date().toISOString()
}

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value || '')
    return parsed === null || parsed === undefined ? fallback : parsed
  } catch {
    return fallback
  }
}

export function listNotifications(db, userId, { tenantId = null, limit = 50, beforeId = null, unreadOnly = false } = {}) {
  const effectiveLimit = Math.max(1, Math.min(200, Number(limit || 50)))

  const params = [String(userId), tenantId ? String(tenantId) : null]
  let sql = `SELECT n.*, ae.event_type AS activity_type, ae.metadata_json AS activity_metadata_json
             FROM notifications n
             LEFT JOIN activity_events ae ON ae.id = n.activity_event_id
             WHERE n.user_id = ? AND n.tenant_id IS ?`

  if (unreadOnly) {
    sql += ' AND n.is_read = 0'
  }

  if (beforeId) {
    sql += ' AND n.id < ?'
    params.push(Number(beforeId))
  }

  sql += ' ORDER BY n.id DESC LIMIT ?'
  params.push(effectiveLimit)

  return db.prepare(sql).all(...params)
}

export function markNotificationRead(db, { userId, id, tenantId = null }) {
  const now = nowIso()
  const res = db
    .prepare(
      `UPDATE notifications
       SET is_read = 1, read_at = COALESCE(read_at, ?)
       WHERE id = ? AND user_id = ? AND tenant_id IS ?`
    )
    .run(now, Number(id), String(userId), tenantId ? String(tenantId) : null)

  return res.changes > 0
}

export function normalizeNotificationRow(row) {
  if (!row) return null
  return {
    id: row.id,
    deliveryType: row.delivery_type,
    title: row.title,
    body: row.body,
    isRead: !!row.is_read,
    readAt: row.read_at || null,
    createdAt: row.created_at,
    activity: row.activity_event_id
      ? {
          eventId: row.activity_event_id,
          type: row.activity_type || null,
          metadata: safeJsonParse(row.activity_metadata_json, {}),
        }
      : null,
  }
}
