export const APPLICATION_STATUS = {
  APPLIED: 'APPLIED',
  SHORTLISTED: 'SHORTLISTED',
  REJECTED: 'REJECTED',
  SELECTED: 'SELECTED',
}

export function normalizeApplicationStatusForWrite(status) {
  const s = String(status || '').trim().toUpperCase()
  if (!s) return ''
  // Backward-compatible: accept OFFERED, but store SELECTED.
  if (s === 'OFFERED') return APPLICATION_STATUS.SELECTED
  return s
}

export function validateApplicationStatus(status) {
  const raw = String(status || '').trim().toUpperCase()
  const allowed = new Set(['APPLIED', 'SELECTED', 'REJECTED', 'SHORTLISTED', 'OFFERED'])
  if (!allowed.has(raw)) {
    return { ok: false, code: 'INVALID_STATE', message: 'Invalid status' }
  }
  return { ok: true }
}

// Admin-controlled state machine. Students can only APPLY.
export function validateAdminStatusTransition({ fromStatus, toStatus }) {
  const from = String(fromStatus || '').trim().toUpperCase() || ''
  const to = String(toStatus || '').trim().toUpperCase() || ''

  // No-op is allowed.
  if (!to || to === from) return { ok: true, changed: false }

  // We intentionally allow broad transitions for now to preserve existing behavior,
  // but keep validation centralized so we can tighten later without touching routes.
  const allowedTo = new Set(['APPLIED', 'SHORTLISTED', 'REJECTED', 'SELECTED', 'OFFERED'])
  if (!allowedTo.has(to)) {
    return { ok: false, code: 'INVALID_STATE', message: 'Invalid status' }
  }

  return { ok: true, changed: true }
}
