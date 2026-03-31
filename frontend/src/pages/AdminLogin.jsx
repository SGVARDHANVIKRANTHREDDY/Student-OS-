import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/apiClient'
import { canAny, isOperator } from '../lib/authz'
import './Login.css'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { loginWithAuth } = useAuth()

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
      const data = await api.post('/api/auth/login/admin', { email, password })
      loginWithAuth({ token: data.token, user: data.user, profile: data.profile, auth: data.auth })
      navigate(decideRedirect(data.auth))
    } catch (err) {
      setError(err?.message || 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Admin portal</h1>
        <p className="signup-hint">
          Sign in to operate Student OS: users, applications, learning, and governance.
        </p>

        <form onSubmit={handleSubmit}>
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
