import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { canAny, isOperator } from '../lib/authz'
import './Login.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { loginWithAuth, login } = useAuth()

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
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      })

      if (!res.ok) {
        setError(res.data?.message || 'Sign-in failed')
        return
      }

      if (res.data?.auth !== undefined) {
        loginWithAuth({ token: res.data.token, user: res.data.user, profile: res.data.profile, auth: res.data.auth })
        navigate(decideRedirect(res.data.auth, res.data.profile))
      } else {
        login({ token: res.data.token, user: res.data.user, profile: res.data.profile })
        navigate(res.data?.profile?.onboarded ? '/app' : '/onboarding')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async (credential) => {
    setError('')
    setLoading(true)
    try {
      const res = await apiFetch('/api/auth/google', {
        method: 'POST',
        body: { credential },
      })

      if (!res.ok) {
        setError(res.data?.message || 'Google sign-in failed')
        return
      }

      if (res.data?.auth !== undefined) {
        loginWithAuth({ token: res.data.token, user: res.data.user, profile: res.data.profile, auth: res.data.auth })
        navigate(decideRedirect(res.data.auth, res.data.profile))
      } else {
        login({ token: res.data.token, user: res.data.user, profile: res.data.profile })
        navigate(res.data?.profile?.onboarded ? '/app' : '/onboarding')
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
