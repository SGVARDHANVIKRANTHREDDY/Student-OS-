import jwt from 'jsonwebtoken'
import { getDb } from '../lib/db.js'
import { DEFAULT_TENANT_ID, effectiveTenantId, getTenantIdFromToken } from '../lib/tenancy.js'
import { getAuthzSnapshot, getTenantIdForUser } from '../lib/rbac.js'

export default function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Backward-compatible: keep req.user as the JWT payload.
    req.user = decoded

    // Tenant + RBAC context. Prefer JWT claims; fall back to DB for older tokens.
    let tenantId = getTenantIdFromToken(decoded)
    let roles = Array.isArray(decoded?.roles) ? decoded.roles : []
    let permissions = Array.isArray(decoded?.permissions) ? decoded.permissions : []

    let userStatus = 'ACTIVE'
    let userDeletedAt = null

    try {
      const db = getDb()

      // Always enforce account status (soft-delete/suspension) for safety.
      const u = db.prepare('SELECT status, deleted_at FROM users WHERE id = ? LIMIT 1').get(decoded.id)
      userStatus = String(u?.status || 'ACTIVE').toUpperCase()
      userDeletedAt = u?.deleted_at || null

      if (!tenantId || roles.length === 0 || permissions.length === 0) {
        tenantId = tenantId || getTenantIdForUser(db, decoded.id) || DEFAULT_TENANT_ID
        const snap = getAuthzSnapshot(db, { userId: decoded.id, tenantId })
        roles = snap.roles
        permissions = snap.permissions
      }
    } catch {
      // Best-effort fallback only.
      tenantId = tenantId || DEFAULT_TENANT_ID
    }

    req.auth = {
      userId: decoded.id,
      tenantId: effectiveTenantId(tenantId),
      roles,
      permissions,
      status: userStatus,
      deletedAt: userDeletedAt,
    }

    if (userStatus !== 'ACTIVE') {
      // Allow idempotent account deletion requests even after soft-delete.
      // This prevents clients from being stuck if they retry DELETE /api/account/me.
      const isAccountDelete =
        req.method === 'DELETE' && req.baseUrl === '/api/account' && String(req.path || '') === '/me'

      if (!isAccountDelete) {
        return res.status(403).json({ message: 'Account is not active', code: 'ACCOUNT_INACTIVE', status: userStatus })
      }
    }

    if (req.params?.userId && String(req.params.userId) !== String(decoded.id)) {
      // Backward-compatible guardrail: default-deny cross-user access.
      // Route handlers should still enforce tenant scope + intent-specific permissions.
      const allowCrossUser =
        permissions.includes('platform:admin') ||
        permissions.includes('users:read:any') ||
        permissions.includes('users:export:any') ||
        permissions.includes('academics:read:any') ||
        permissions.includes('academics:write') ||
        permissions.includes('tasks:read:any') ||
        permissions.includes('tasks:assign') ||
        permissions.includes('tasks:stats') ||
        permissions.includes('skills:profile:read:any') ||
        permissions.includes('skills:profile:write:any')

      if (!allowCrossUser) return res.status(403).json({ message: 'Forbidden' })
    }

    next()
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}
