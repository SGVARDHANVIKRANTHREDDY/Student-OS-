import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import { queryKeys } from '../lib/queryClient'
import StatusCards from '../components/StatusCards'
import './Dashboard.css'

const QUICK_LINKS = [
  { label: 'Resume Builder', to: '/app/resume', icon: '📄', desc: 'Build & analyze your resume' },
  { label: 'Skill Analysis', to: '/app/skills', icon: '⚡', desc: 'Find skill gaps for target roles' },
  { label: 'Job Board', to: '/app/jobs', icon: '💼', desc: 'Browse & apply to openings' },
  { label: 'Academics', to: '/app/academics', icon: '📚', desc: 'Track scores & attendance' },
  { label: 'Learning', to: '/app/learning', icon: '🎓', desc: 'Curated courses for skill gaps' },
  { label: 'Roadmaps', to: '/app/roadmaps', icon: '🗺', desc: 'Company-specific prep plans' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, token } = useAuth()

  const { data: resumeData } = useQuery({
    queryKey: queryKeys.resume(user?.id),
    queryFn: () => api.get(`/api/resume/${encodeURIComponent(user.id)}`, token),
    enabled: !!token && !!user?.id,
  })

  const resume = resumeData?.data ?? resumeData
  const stats = resume ? {
    hasResume: true,
    skillCount: Array.isArray(resume.skills) ? resume.skills.length : 0,
  } : null

  return (
    <div className="dashboard animate-in">
      <div className="dashboard-greeting">
        <div>
          <h1 className="dashboard-title">
            {getGreeting()}, {user?.name?.split(' ')[0] || 'there'}
          </h1>
          <p className="dashboard-subtitle">Here's your placement readiness snapshot.</p>
        </div>
      </div>

      <StatusCards stats={stats} />

      <section className="dashboard-section">
        <h2 className="section-title">Quick Actions</h2>
        <div className="quick-links stagger-children">
          {QUICK_LINKS.map(link => (
            <button key={link.to} className="quick-link-card" onClick={() => navigate(link.to)}>
              <span className="quick-link-icon">{link.icon}</span>
              <div className="quick-link-content">
                <span className="quick-link-label">{link.label}</span>
                <span className="quick-link-desc">{link.desc}</span>
              </div>
              <span className="quick-link-arrow">→</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
