function compactMessage(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

export function toPublicError(err, { fallbackMessage = 'Something went wrong. Please try again.' } = {}) {
  const msg = compactMessage(err?.message || err)

  // Keep these explicitly user-safe.
  const allowList = [
    'forbidden',
    'tenant access denied',
    'resume version not found',
    'missing parsed snapshot',
    'job not found',
    'template not found',
    'only pdf uploads are supported',
    'render not ready',
  ]

  const normalized = msg.toLowerCase()
  if (allowList.some((s) => normalized.includes(s))) {
    return msg
  }

  return fallbackMessage
}
