import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Landing.css'

export default function Landing() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-brand">Student OS</div>
        <div className="landing-actions">
          {isAuthenticated ? (
            <button className="btn-primary" onClick={() => navigate('/app')}>
              Open dashboard
            </button>
          ) : (
            <>
              <button className="btn-link" onClick={() => navigate('/student/login')}>
                Sign in
              </button>
              <button className="btn-primary" onClick={() => navigate('/signup')}>
                Create account
              </button>
            </>
          )}
        </div>
      </header>

      <main className="landing-main">
        <div className="landing-hero">
          <h1>One workspace for academics, skills, resume, and placements.</h1>
          <p>
            Track your semester performance, build job-ready skills, maintain a structured resume, and stay
            consistent with learning and placement preparation.
          </p>

          <div className="landing-cta">
            {isAuthenticated ? (
              <button className="btn-primary" onClick={() => navigate('/app')}>
                Continue
              </button>
            ) : (
              <>
                <button className="btn-primary" onClick={() => navigate('/signup')}>
                  Get started
                </button>
                <button className="btn-link" onClick={() => navigate('/student/login')}>
                  I already have an account
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
