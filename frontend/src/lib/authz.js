export function normalizePermissions(auth) {
  const perms = auth?.permissions
  if (Array.isArray(perms)) return perms.map((p) => String(p))
  return []
}

export function hasPermission(auth, perm) {
  const want = String(perm || '').trim()
  if (!want) return false
  const perms = normalizePermissions(auth)
  return perms.includes(want)
}

export function isPlatformAdmin(auth) {
  return hasPermission(auth, 'platform:admin')
}

export function canAny(auth, perms) {
  const list = Array.isArray(perms) ? perms : []
  for (const p of list) {
    if (hasPermission(auth, p)) return true
  }
  return false
}

export function isOperator(auth) {
  return (
    isPlatformAdmin(auth) ||
    canAny(auth, [
      'users:read:any',
      'users:export:any',
      'applications:read:any',
      'applications:update:any',
      'learning:courses:read:any',
      'learning:courses:write',
      'jobs:admin:create',
    ])
  )
}
