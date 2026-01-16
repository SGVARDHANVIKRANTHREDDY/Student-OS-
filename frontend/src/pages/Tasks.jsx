import TasksSection from '../components/TasksSection'
import { useAuth } from '../context/AuthContext'

export default function Tasks() {
  const { user, token } = useAuth()

  return (
    <div>
      <h2 style={{ margin: 0, color: '#111827' }}>Tasks</h2>
      <p style={{ marginTop: 6, color: '#6b7280', fontSize: 13 }}>
        Manage assignments and exams in one place.
      </p>
      <div style={{ marginTop: 16 }}>
        <TasksSection userId={user?.id} token={token} />
      </div>
    </div>
  )
}
