import { getDb } from './db.js'

export const ACCOUNT_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
}

export function getAccountState(db, userId) {
  if (!db) db = getDb()
  const row = db.prepare('SELECT status, deleted_at FROM users WHERE id = ? LIMIT 1').get(String(userId))
  const status = String(row?.status || ACCOUNT_STATUS.ACTIVE).toUpperCase()
  const deletedAt = row?.deleted_at || null
  return { status, deletedAt }
}

export function isAccountActive(db, userId) {
  const s = getAccountState(db, userId)
  return s.status === ACCOUNT_STATUS.ACTIVE
}
