import './StatusCards.css'

export default function StatusCards() {
  return (
    <div className="status-section">
      <h3>📊 Status Overview</h3>
      <div className="status-grid">
        <div className="status-card">
          <h4>📄 Resume</h4>
          <div className="status-placeholder">Not Started</div>
          <p className="status-hint">Build from your academics and skills</p>
        </div>
        <div className="status-card">
          <h4>🔍 Skill Gaps</h4>
          <div className="status-placeholder">Pending Analysis</div>
          <p className="status-hint">Compare with job requirements</p>
        </div>
        <div className="status-card">
          <h4>💼 Job Readiness</h4>
          <div className="status-score">0%</div>
          <p className="status-hint">Complete profile to increase score</p>
        </div>
      </div>
    </div>
  )
}
