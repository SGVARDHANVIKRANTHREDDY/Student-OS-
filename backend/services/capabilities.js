import { hasPermission } from '../lib/rbac.js'

// Capability layer: stable, use-case oriented permissions.
// Backward-compatible: maps capabilities to existing permission keys.
const legacyPermissionsByCapability = {
  'job:create': ['jobs:admin:create'],
  'job:update': ['jobs:admin:create'],
  'job:open': ['jobs:admin:create'],
  'job:close': ['jobs:admin:create'],
  'job:archive': ['jobs:admin:create'],
  'job:deadline:update': ['jobs:admin:create'],

  'application:read:any': ['applications:read:any'],
  'application:update_status': ['applications:update:any'],
}

export function hasCapability(auth, capability) {
  const caps = legacyPermissionsByCapability[String(capability || '')] || []
  if (caps.length === 0) return false
  return caps.some((p) => hasPermission(auth, p))
}

export function requiredLegacyPermissionsForCapability(capability) {
  return legacyPermissionsByCapability[String(capability || '')] || []
}
