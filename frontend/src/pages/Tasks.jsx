import TasksSection from '../components/TasksSection'
import { useAuth } from '../context/AuthContext'
import './Admin.css'

export default function Tasks() {
  const { user, token } = useAuth()

  return (
    <div className="admin-page">
      <h2>Tasks</h2>
      <p className="subtitle">
        Manage assignments and exams in one place.
      </p>
      <div className="section-wrap">
        <TasksSection userId={user?.id} token={token} />
      </div>
    </div>
  )
}
