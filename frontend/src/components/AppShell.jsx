import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAny, isOperator } from '../lib/authz'
import './AppShell.css'

export default function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, auth, logout } = useAuth()

  const showAdmin = isOperator(auth)
  const canUsers = canAny(auth, ['users:read:any'])
  const canApps = canAny(auth, ['applications:read:any'])
  const canCourses = canAny(auth, ['learning:courses:read:any', 'learning:courses:write'])

  const handleLogout = () => {
    logout()
    const next = location?.pathname && String(location.pathname).startsWith('/app/admin') ? '/admin/login' : '/student/login'
    navigate(next)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" onClick={() => navigate('/app')}>Student System</div>
        <nav className="nav">
          <NavLink to="/app" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Overview
          </NavLink>
          <NavLink to="/app/academics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Academics
          </NavLink>
          <NavLink to="/app/skills" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Skills
          </NavLink>
          <NavLink to="/app/tasks" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Tasks
          </NavLink>
          <NavLink to="/app/roadmaps" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Placement Roadmaps
          </NavLink>
          <NavLink to="/app/resume" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Resume
          </NavLink>
          <NavLink to="/app/jobs" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Jobs
          </NavLink>
          <NavLink to="/app/applications" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Applications
          </NavLink>
          <NavLink to="/app/learning" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Learning
          </NavLink>

          {showAdmin && (
            <div style={{ marginTop: 14 }}>
              <div style={{ padding: '6px 12px', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>
                Admin
              </div>
              {canUsers && (
                <NavLink to="/app/admin/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  Users
                </NavLink>
              )}
              {canApps && (
                <NavLink to="/app/admin/applications" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  Applications
                </NavLink>
              )}
              {canCourses && (
                <NavLink to="/app/admin/courses" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  Courses
                </NavLink>
              )}
            </div>
          )}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">{user?.name ? `Welcome, ${user.name}` : 'Student System'}</div>
            <div className="topbar-subtitle">Prepare → Apply → Track → Improve</div>
          </div>
          <div className="topbar-right">
            <div className="user-chip">{user?.email || 'Student'}</div>
            <button className="btn" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
