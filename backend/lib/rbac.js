import { effectiveTenantId } from './tenancy.js'

export function ensureTenantMembership(db, userId, tenantId) {
  const tid = effectiveTenantId(tenantId)
  const now = new Date().toISOString()
  db.prepare(
    `INSERT OR IGNORE INTO tenant_memberships (user_id, tenant_id, status, created_at, updated_at)
     VALUES (?, ?, 'ACTIVE', ?, ?)`
  ).run(String(userId), tid, now, now)
  return tid
}

export function getTenantIdForUser(db, userId) {
  const row = db.prepare('SELECT tenant_id FROM tenant_memberships WHERE user_id = ? AND status = \'ACTIVE\'').get(String(userId))
  return row?.tenant_id || null
}

export function ensureDefaultRoleAssignments(db, { userId, tenantId, legacyRole } = {}) {
  const tid = effectiveTenantId(tenantId)
  const now = new Date().toISOString()

  db.prepare(
    `INSERT OR IGNORE INTO tenant_role_assignments (tenant_id, user_id, role_key, status, created_at, updated_at)
     VALUES (?, ?, 'STUDENT', 'ACTIVE', ?, ?)`
  ).run(tid, String(userId), now, now)

  if (String(legacyRole || '').toLowerCase() === 'admin') {
    db.prepare(
      `INSERT OR IGNORE INTO tenant_role_assignments (tenant_id, user_id, role_key, status, created_at, updated_at)
       VALUES (?, ?, 'PLATFORM_ADMIN', 'ACTIVE', ?, ?)`
    ).run(tid, String(userId), now, now)
  }

  return tid
}

export function getAuthzSnapshot(db, { userId, tenantId } = {}) {
  const tid = effectiveTenantId(tenantId)
  const uid = String(userId)

  const roleRows = db
    .prepare(
      `SELECT role_key
       FROM tenant_role_assignments
       WHERE tenant_id = ? AND user_id = ? AND status = 'ACTIVE'`
    )
    .all(tid, uid)

  const roles = roleRows.map((r) => r.role_key)

  const permRows = db
    .prepare(
      `SELECT DISTINCT rp.permission_key AS permission_key
       FROM tenant_role_assignments tra
       JOIN role_permissions rp ON rp.role_key = tra.role_key
       WHERE tra.tenant_id = ? AND tra.user_id = ? AND tra.status = 'ACTIVE'`
    )
    .all(tid, uid)

  const permissions = permRows.map((r) => r.permission_key)

  return { tenantId: tid, roles, permissions }
}

export function hasPermission(auth, permissionKey) {
  if (!auth) return false
  const pk = String(permissionKey || '').trim()
  if (!pk) return false
  const perms = Array.isArray(auth.permissions) ? auth.permissions : []
  return perms.includes(pk)
}

export function hasAnyPermission(auth, permissionKeys) {
  const keys = Array.isArray(permissionKeys) ? permissionKeys : []
  for (const k of keys) {
    if (hasPermission(auth, k)) return true
  }
  return false
}

export function requirePermission(permissionKey) {
  return (req, res, next) => {
    if (!hasPermission(req.auth, permissionKey)) {
      return res.status(403).json({
        message: 'Forbidden',
        code: 'FORBIDDEN',
        requiredPermission: String(permissionKey || ''),
      })
    }
    return next()
  }
}

export function requireAnyPermission(permissionKeys) {
  const keys = Array.isArray(permissionKeys) ? permissionKeys : []

  return (req, res, next) => {
    if (!hasAnyPermission(req.auth, keys)) {
      return res.status(403).json({
        message: 'Forbidden',
        code: 'FORBIDDEN',
        requiredAnyPermission: keys.map((k) => String(k || '')).filter(Boolean),
      })
    }
    return next()
  }
}
