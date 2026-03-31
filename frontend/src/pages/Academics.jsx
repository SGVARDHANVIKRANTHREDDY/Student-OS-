import AcademicsSection from '../components/AcademicsSection'
import { useAuth } from '../context/AuthContext'
import './Admin.css'

export default function Academics() {
  const { user, token } = useAuth()

  return (
    <div className="admin-page">
      <h2>Academics</h2>
      <p className="subtitle">
        Track attendance, subjects, and your career goal.
      </p>
      <div className="section-wrap">
        <AcademicsSection userId={user?.id} token={token} />
      </div>
    </div>
  )
}
