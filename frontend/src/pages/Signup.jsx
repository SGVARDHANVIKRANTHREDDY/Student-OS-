import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import GoogleSignInButton from '../components/GoogleSignInButton'
import './Login.css'

export default function Signup() {
  const navigate = useNavigate()
  const { loginWithAuth, login } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await apiFetch('/api/auth/signup', {
        method: 'POST',
        body: { name, email, password },
      })

      if (!res.ok) {
        setError(res.data?.message || 'Account creation failed')
        return
      }

      login({ token: res.data.token, user: res.data.user, profile: res.data.profile })
      navigate('/onboarding')
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
      } else {
        login({ token: res.data.token, user: res.data.user, profile: res.data.profile })
      }
      navigate(res.data?.profile?.onboarded ? '/app' : '/onboarding')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Create your Student System</h1>
        <p className="signup-hint" style={{ marginTop: 6 }}>
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
