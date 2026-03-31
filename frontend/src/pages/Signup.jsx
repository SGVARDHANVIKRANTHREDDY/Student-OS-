import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/apiClient'
import GoogleSignInButton from '../components/GoogleSignInButton'
import './Login.css'

export default function Signup() {
  const navigate = useNavigate()
  const { loginWithAuth, isAuthenticated, profile } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await api.post('/api/auth/signup', { name, email, password })
      loginWithAuth({ token: data.token, user: data.user, profile: data.profile, auth: data.auth })
      navigate(data.profile?.onboarded ? '/app' : '/onboarding')
    } catch (err) {
      setError(err?.message || 'Account creation failed')
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
      navigate(data.profile?.onboarded ? '/app' : '/onboarding')
    } catch (err) {
      setError(err?.message || 'Google sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Create your Student System</h1>
        <p className="signup-hint">
          One workspace for academics, skills, resume, and placement readiness.
        </p>

        <div className="google-wrap">
          <GoogleSignInButton onCredential={handleGoogle} disabled={loading} />
        </div>

        <div className="divider">or</div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Full name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <button
          className="btn-link"
          style={{ marginTop: 14 }}
          onClick={() => navigate('/student/login')}
        >
          Already have an account? Sign in
        </button>
      </div>
    </div>
  )
}
