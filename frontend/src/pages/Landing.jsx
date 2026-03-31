import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Landing.css'

const FEATURES = [
  { icon: '📚', title: 'Academics', desc: 'Track subjects, scores, attendance, and career goals in one place.' },
  { icon: '📄', title: 'Resume Builder', desc: 'Build ATS-friendly resumes with intelligent scoring and gap analysis.' },
  { icon: '⚡', title: 'Skill Matching', desc: 'Compare your skills against real job requirements instantly.' },
  { icon: '🎓', title: 'Learning Paths', desc: 'Get personalized roadmaps to close skill gaps and level up.' },
  { icon: '💼', title: 'Job Discovery', desc: 'Browse, save, and apply to internships and jobs with tracking.' },
  { icon: '🗺', title: 'Placement Roadmaps', desc: 'Company-specific prep guides for DSA, projects, and interviews.' },
]

export default function Landing() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-brand">
          <span className="landing-brand-icon">S</span>
          <span>Student OS</span>
        </div>
        <div className="landing-actions">
          {isAuthenticated ? (
            <button className="landing-btn landing-btn--primary" onClick={() => navigate('/app')}>
              Open Dashboard
            </button>
          ) : (
            <>
              <button className="landing-btn landing-btn--ghost" onClick={() => navigate('/student/login')}>
                Sign in
              </button>
              <button className="landing-btn landing-btn--primary" onClick={() => navigate('/signup')}>
                Get Started
              </button>
            </>
          )}
        </div>
      </header>

      <main className="landing-main">
        <div className="landing-hero">
          <div className="landing-badge">Placement readiness, simplified</div>
          <h1 className="landing-title">
            One workspace for academics, skills,
            <span className="landing-title-accent"> resume & placements.</span>
          </h1>
          <p className="landing-description">
            Track your semester performance, build job-ready skills, maintain a structured resume, and stay
            consistent with learning and placement preparation — all in one place.
          </p>

          <div className="landing-cta">
            {isAuthenticated ? (
              <button className="landing-btn landing-btn--primary landing-btn--lg" onClick={() => navigate('/app')}>
                Continue to Dashboard
              </button>
            ) : (
              <>
                <button className="landing-btn landing-btn--primary landing-btn--lg" onClick={() => navigate('/signup')}>
                  Start for free
                </button>
                <button className="landing-btn landing-btn--outline landing-btn--lg" onClick={() => navigate('/student/login')}>
                  I have an account
                </button>
              </>
            )}
          </div>
        </div>

        <section className="landing-features">
          <div className="landing-features-grid stagger-children">
            {FEATURES.map(f => (
              <div key={f.title} className="feature-card">
                <div className="feature-icon">{f.icon}</div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="landing-footer">
          <p>Built for students preparing for placements and internships.</p>
        </footer>
      </main>
    </div>
  )
}
