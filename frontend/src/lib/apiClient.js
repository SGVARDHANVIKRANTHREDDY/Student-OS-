/**
 * Enhanced API client with automatic token refresh, request deduplication,
 * and standardized error handling.  Designed to work with React Query.
 */

const TOKEN_KEY = 'token'

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem('user')
  localStorage.removeItem('profile')
  localStorage.removeItem('auth')
}

let refreshPromise = null

async function refreshAccessToken() {
  // Deduplicate concurrent refresh calls
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.token) {
        setToken(data.token)
        window.dispatchEvent(new CustomEvent('auth:refreshed', { detail: { token: data.token } }))
        return data.token
      }
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * Core fetch wrapper.  Returns parsed JSON `data` on success,
 * throws `ApiError` on failure.
 *
 * Options:
 *   method, body, token, skipAuth, signal (AbortController)
 */
export async function apiClient(path, { method = 'GET', body, token, skipAuth = false, signal } = {}) {
  const effectiveToken = token || (skipAuth ? '' : getToken())

  const headers = { 'Content-Type': 'application/json' }
  if (effectiveToken) headers.Authorization = `Bearer ${effectiveToken}`

  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    signal,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  // Automatic token refresh on 401
  if (res.status === 401 && !skipAuth && !token) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      return apiClient(path, { method, body, token: newToken, skipAuth: true, signal })
    }
    clearAuth()
    window.dispatchEvent(new CustomEvent('auth:expired'))
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expired')
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code || data?.code || 'UNKNOWN',
      data?.error?.message || data?.message || `Request failed (${res.status})`,
      data?.error?.details || data?.details,
    )
  }

  // Unwrap standardized envelope if present
  return data?.ok !== undefined ? (data.data ?? data) : data
}

// Convenience methods
export const api = {
  get: (path, opts) => apiClient(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => apiClient(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => apiClient(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => apiClient(path, { ...opts, method: 'PATCH', body }),
  delete: (path, opts) => apiClient(path, { ...opts, method: 'DELETE' }),
}

// Keep backward compatibility with old apiFetch
export async function apiFetch(path, { token, method = 'GET', body } = {}) {
  try {
    const data = await apiClient(path, { method, body, token, skipAuth: !token && method === 'GET' })
    return { ok: true, status: 200, data }
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, status: err.status, data: { message: err.message, code: err.code } }
    }
    return { ok: false, status: 0, data: { message: err.message } }
  }
}
