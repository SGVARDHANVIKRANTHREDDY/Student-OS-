import { effectiveTenantId } from './tenancy.js'

export function isUserInTenant(db, { tenantId, userId }) {
  const tid = effectiveTenantId(tenantId)
  const uid = String(userId)
  const row = db
    .prepare("SELECT tenant_id FROM tenant_memberships WHERE user_id = ? AND tenant_id = ? AND status = 'ACTIVE'")
    .get(uid, String(tid))
  return !!row?.tenant_id
}

export function requireUserInTenant(db, { tenantId, userId }) {
  const ok = isUserInTenant(db, { tenantId, userId })
  return ok
}
