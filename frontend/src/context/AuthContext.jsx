import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null')
    } catch {
      return null
    }
  })
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('profile') || 'null')
    } catch {
      return null
    }
  })
  const [auth, setAuth] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('auth') || 'null')
    } catch {
      return null
    }
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const restore = async () => {
      if (!token) {
        setReady(true)
        return
      }

      let res = await apiFetch('/api/auth/me', { token })
      if (!res.ok && (res.status === 401 || res.status === 403)) {
        const refreshed = await apiFetch('/api/auth/refresh', { method: 'POST' })
        if (refreshed.ok && refreshed.data?.token) {
          localStorage.setItem('token', refreshed.data.token)
          setToken(refreshed.data.token)
          res = await apiFetch('/api/auth/me', { token: refreshed.data.token })
        }
      }

      if (!res.ok) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        localStorage.removeItem('profile')
        setToken('')
        setUser(null)
        setProfile(null)
        setReady(true)
        return
      }

      localStorage.setItem('user', JSON.stringify(res.data.user))
      localStorage.setItem('profile', JSON.stringify(res.data.profile))
      if (res.data.auth !== undefined) {
        localStorage.setItem('auth', JSON.stringify(res.data.auth))
        setAuth(res.data.auth)
      }
      setUser(res.data.user)
      setProfile(res.data.profile)
      setReady(true)
    }

    restore()
  }, [token])

  const isAuthenticated = !!token

  const login = ({ token: newToken, user: newUser, profile: newProfile }) => {
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
    if (newProfile !== undefined) {
      localStorage.setItem('profile', JSON.stringify(newProfile))
      setProfile(newProfile)
    }
    setToken(newToken)
    setUser(newUser)
  }

  const setAuthSnapshot = (nextAuth) => {
    localStorage.setItem('auth', JSON.stringify(nextAuth))
    setAuth(nextAuth)
  }

  const loginWithAuth = ({ token: newToken, user: newUser, profile: newProfile, auth: newAuth }) => {
    login({ token: newToken, user: newUser, profile: newProfile })
    if (newAuth !== undefined) setAuthSnapshot(newAuth)
  }

  const logout = () => {
    // Best-effort server-side logout (revokes refresh token cookie).
    apiFetch('/api/auth/logout', { method: 'POST', token }).catch(() => {})
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('profile')
    localStorage.removeItem('auth')
    setToken('')
    setUser(null)
    setProfile(null)
    setAuth(null)
  }

  const refreshMe = async () => {
    if (!token) return { ok: false, status: 401, data: { message: 'No token' } }
    let res = await apiFetch('/api/auth/me', { token })
    if (!res.ok && (res.status === 401 || res.status === 403)) {
      const refreshed = await apiFetch('/api/auth/refresh', { method: 'POST' })
      if (refreshed.ok && refreshed.data?.token) {
        localStorage.setItem('token', refreshed.data.token)
        setToken(refreshed.data.token)
        res = await apiFetch('/api/auth/me', { token: refreshed.data.token })
      }
    }
    if (res.ok) {
      localStorage.setItem('user', JSON.stringify(res.data.user))
      localStorage.setItem('profile', JSON.stringify(res.data.profile))
      setUser(res.data.user)
      setProfile(res.data.profile)
      if (res.data.auth !== undefined) {
        localStorage.setItem('auth', JSON.stringify(res.data.auth))
        setAuth(res.data.auth)
      }
    }
    return res
  }

  const updateProfile = (nextProfile) => {
    localStorage.setItem('profile', JSON.stringify(nextProfile))
    setProfile(nextProfile)
  }

  const value = useMemo(
    () => ({
      ready,
      token,
      user,
      profile,
      auth,
      isAuthenticated,
      login,
      loginWithAuth,
      logout,
      refreshMe,
      updateProfile,
      setAuthSnapshot,
    }),
    [ready, token, user, profile, auth, isAuthenticated]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
