import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function PrivateRoute({ requireOnboarded = false, children }) {
  const { ready, isAuthenticated, profile } = useAuth()
  const location = useLocation()

  if (!ready) {
    return <div className="state-msg">Loading…</div>
  }

  if (!isAuthenticated) {
    const next = location?.pathname && String(location.pathname).startsWith('/app/admin') ? '/admin/login' : '/student/login'
    return <Navigate to={next} replace />
  }

  if (requireOnboarded && !profile?.onboarded) {
    return <Navigate to="/onboarding" replace />
  }

  return children
}
