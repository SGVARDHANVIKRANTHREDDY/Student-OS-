import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAny, isPlatformAdmin } from '../lib/authz'

export default function RequirePermission({ anyOf = [], children, fallback = null }) {
  const { ready, isAuthenticated, auth } = useAuth()
  const location = useLocation()

  if (!ready) return <div style={{ padding: '20px' }}>Loading…</div>
  if (!isAuthenticated) {
    const next = location?.pathname && String(location.pathname).startsWith('/app/admin') ? '/admin/login' : '/student/login'
    return <Navigate to={next} replace />
  }

  const allowed = isPlatformAdmin(auth) || canAny(auth, anyOf)
  if (!allowed) {
    if (fallback) return fallback
    return (
      <div style={{ padding: 20 }}>
        <h2 style={{ margin: 0, color: '#111827' }}>Forbidden</h2>
        <p style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>
          You don’t have access to this page.
        </p>
      </div>
    )
  }

  return children
}
