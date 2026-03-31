import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAny, isOperator } from '../lib/authz'
import './AppShell.css'

const NAV_ITEMS = [
  { to: '/app', label: 'Overview', icon: '◻', end: true },
  { to: '/app/academics', label: 'Academics', icon: '📚' },
  { to: '/app/skills', label: 'Skills', icon: '⚡' },
  { to: '/app/tasks', label: 'Tasks', icon: '✓' },
  { to: '/app/roadmaps', label: 'Roadmaps', icon: '🗺' },
  { to: '/app/resume', label: 'Resume', icon: '📄' },
  { to: '/app/jobs', label: 'Jobs', icon: '💼' },
  { to: '/app/applications', label: 'Applications', icon: '📋' },
  { to: '/app/learning', label: 'Learning', icon: '🎓' },
]

export default function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, auth, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const showAdmin = isOperator(auth)
  const canUsers = canAny(auth, ['users:read:any'])
  const canApps = canAny(auth, ['applications:read:any'])
  const canCourses = canAny(auth, ['learning:courses:read:any', 'learning:courses:write'])

  const handleLogout = () => {
    logout()
    const next = location?.pathname && String(location.pathname).startsWith('/app/admin') ? '/admin/login' : '/student/login'
    navigate(next)
  }

  const initials = (user?.name || user?.email || 'U')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand" onClick={() => { navigate('/app'); setMobileOpen(false) }}>
            <span className="brand-icon">S</span>
            <span className="brand-text">Student OS</span>
          </div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">✕</button>
        </div>

        <nav className="nav" role="navigation" aria-label="Main navigation">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}

          {showAdmin && (
            <div className="nav-section">
              <div className="nav-section-title">Admin</div>
              {canUsers && (
                <NavLink to="/app/admin/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileOpen(false)}>
                  <span className="nav-icon">👥</span>
                  <span className="nav-label">Users</span>
                </NavLink>
              )}
              {canApps && (
                <NavLink to="/app/admin/applications" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileOpen(false)}>
                  <span className="nav-icon">📊</span>
                  <span className="nav-label">Applications</span>
                </NavLink>
              )}
              {canCourses && (
                <NavLink to="/app/admin/courses" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileOpen(false)}>
                  <span className="nav-icon">📖</span>
                  <span className="nav-label">Courses</span>
                </NavLink>
              )}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.name || 'Student'}</div>
              <div className="sidebar-user-email">{user?.email}</div>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <span /><span /><span />
            </button>
            <div>
              <div className="topbar-title">{user?.name ? `Welcome back, ${user.name}` : 'Student OS'}</div>
              <div className="topbar-subtitle">Prepare → Apply → Track → Improve</div>
            </div>
          </div>
          <div className="topbar-right">
            <div className="user-chip">
              <div className="user-avatar">{initials}</div>
              <span className="user-email">{user?.email || 'Student'}</span>
            </div>
            <button className="btn-logout" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        <main className="content">
          <div className="content-inner">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
