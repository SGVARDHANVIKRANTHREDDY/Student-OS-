export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

export function normalizeTenantId(value) {
  const v = String(value || '').trim()
  return v || null
}

export function getTenantIdFromToken(decoded) {
  if (!decoded) return null
  return normalizeTenantId(decoded.tenantId || decoded.tenant_id)
}

export function getTenantIdFromRequest(req) {
  return normalizeTenantId(req?.auth?.tenantId || req?.user?.tenantId || req?.user?.tenant_id)
}

export function effectiveTenantId(value) {
  return normalizeTenantId(value) || DEFAULT_TENANT_ID
}
