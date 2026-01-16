import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import { canAny, isOperator } from '../lib/authz'
import './Login.css'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { loginWithAuth, login } = useAuth()

  const decideRedirect = (auth) => {
    if (isOperator(auth)) {
      if (canAny(auth, ['users:read:any'])) return '/app/admin/users'
      if (canAny(auth, ['applications:read:any'])) return '/app/admin/applications'
      if (canAny(auth, ['learning:courses:read:any', 'learning:courses:write'])) return '/app/admin/courses'
      return '/app'
    }
    return '/app'
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await apiFetch('/api/auth/login/admin', {
        method: 'POST',
        body: { email, password },
      })

      if (!res.ok) {
        setError(res.data?.message || 'Sign-in failed')
        return
      }

      if (res.data?.auth !== undefined) {
        loginWithAuth({ token: res.data.token, user: res.data.user, profile: res.data.profile, auth: res.data.auth })
        navigate(decideRedirect(res.data.auth))
      } else {
        login({ token: res.data.token, user: res.data.user, profile: res.data.profile })
        navigate('/app')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Admin portal</h1>
        <p className="signup-hint" style={{ marginTop: 6 }}>
          Sign in to operate Student OS: users, applications, learning, and governance.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 10 }}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <button className="btn-link" onClick={() => navigate('/student/login')}>
          Not an admin? Go to student sign-in
        </button>
      </div>
    </div>
  )
}
