import './StatusCards.css'

export default function StatusCards({ stats }) {
  const hasResume = stats?.hasResume
  const skillCount = stats?.skillCount ?? 0

  const cards = [
    {
      icon: '📄',
      label: 'Resume',
      value: hasResume ? 'Active' : 'Not Started',
      hint: hasResume ? 'Resume is on file — keep it updated' : 'Build from your academics and skills',
      status: hasResume ? 'success' : 'neutral',
    },
    {
      icon: '⚡',
      label: 'Skills Tracked',
      value: skillCount > 0 ? String(skillCount) : '—',
      hint: skillCount > 0 ? `${skillCount} skills in your profile` : 'Complete resume & courses to populate',
      status: skillCount > 0 ? 'success' : 'neutral',
    },
    {
      icon: '💼',
      label: 'Job Readiness',
      value: hasResume && skillCount >= 5 ? 'On Track' : 'Getting Started',
      hint: 'Based on resume completeness and skill coverage',
      status: hasResume && skillCount >= 5 ? 'success' : 'warning',
    },
  ]

  return (
    <div className="status-section">
      <div className="status-grid stagger-children">
        {cards.map(card => (
          <div key={card.label} className={`status-card status-card--${card.status}`}>
            <div className="status-card-header">
              <span className="status-card-icon">{card.icon}</span>
              <span className="status-card-label">{card.label}</span>
            </div>
            <div className="status-card-value">{card.value}</div>
            <p className="status-card-hint">{card.hint}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
