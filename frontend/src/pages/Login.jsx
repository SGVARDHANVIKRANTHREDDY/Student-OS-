import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/apiClient'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { canAny, isOperator } from '../lib/authz'
import './Login.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { loginWithAuth, isAuthenticated, profile } = useAuth()

  // Redirect already-authenticated users
  useEffect(() => {
    if (isAuthenticated) {
      if (profile?.onboarded) {
        navigate('/app', { replace: true })
      } else {
        navigate('/onboarding', { replace: true })
      }
    }
  }, [isAuthenticated, profile, navigate])

  const decideRedirect = (auth, profile) => {
    if (isOperator(auth)) {
      if (canAny(auth, ['users:read:any'])) return '/app/admin/users'
      if (canAny(auth, ['applications:read:any'])) return '/app/admin/applications'
      if (canAny(auth, ['learning:courses:read:any', 'learning:courses:write'])) return '/app/admin/courses'
      return '/app'
    }
    return profile?.onboarded ? '/app' : '/onboarding'
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await api.post('/api/auth/login', { email, password })
      loginWithAuth({ token: data.token, user: data.user, profile: data.profile, auth: data.auth })
      navigate(decideRedirect(data.auth, data.profile))
    } catch (err) {
      setError(err?.message || 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async (credential) => {
    setError('')
    setLoading(true)
    try {
      const data = await api.post('/api/auth/google', { credential })
      loginWithAuth({ token: data.token, user: data.user, profile: data.profile, auth: data.auth })
      navigate(decideRedirect(data.auth, data.profile))
    } catch (err) {
      setError(err?.message || 'Google sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Student System</h1>
        <div className="google-wrap">
          <GoogleSignInButton onCredential={handleGoogle} disabled={loading} />
        </div>

        <div className="divider">or</div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <button className="btn-link" onClick={() => navigate('/signup')}>
          New here? Create an account
        </button>
        <button className="btn-link" onClick={() => navigate('/admin/login')}>
          Admin? Sign in to the admin portal
        </button>
      </div>
    </div>
  )
}
