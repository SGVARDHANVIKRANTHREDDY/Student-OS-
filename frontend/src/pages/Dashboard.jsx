import StatusCards from '../components/StatusCards'
import { useNavigate } from 'react-router-dom'
import './Dashboard.css'

export default function Dashboard() {
  const navigate = useNavigate()

  return (
    <div className="dashboard-container">
      <main className="dashboard-main">
        <div className="greeting">
          <h2>Overview</h2>
          <p className="flow">Your current placement readiness snapshot</p>
        </div>

        <StatusCards />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
          <button className="btn-nav" onClick={() => navigate('/app/roadmaps')}>Go to Roadmaps</button>
          <button className="btn-nav" onClick={() => navigate('/app/resume')}>Go to Resume</button>
          <button className="btn-nav" onClick={() => navigate('/app/academics')}>Go to Academics</button>
        </div>
      </main>
    </div>
  )
}
