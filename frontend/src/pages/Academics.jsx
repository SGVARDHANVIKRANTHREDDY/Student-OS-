import AcademicsSection from '../components/AcademicsSection'
import { useAuth } from '../context/AuthContext'

export default function Academics() {
  const { user, token } = useAuth()

  return (
    <div>
      <h2 style={{ margin: 0, color: '#111827' }}>Academics</h2>
      <p style={{ marginTop: 6, color: '#6b7280', fontSize: 13 }}>
        Track attendance, subjects, and your career goal.
      </p>
      <div style={{ marginTop: 16 }}>
        <AcademicsSection userId={user?.id} token={token} />
      </div>
    </div>
  )
}
