import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import AdminLogin from './pages/AdminLogin'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Resume from './pages/Resume'
import Roadmaps from './pages/Roadmaps'
import Skills from './pages/Skills'
import Jobs from './pages/Jobs'
import JobDetails from './pages/JobDetails'
import Learning from './pages/Learning'
import Signup from './pages/Signup'
import Onboarding from './pages/Onboarding'
import Applications from './pages/Applications'
import AdminUsers from './pages/AdminUsers'
import AdminApplications from './pages/AdminApplications'
import AdminCourses from './pages/AdminCourses'
import AppShell from './components/AppShell'
import Academics from './pages/Academics'
import Tasks from './pages/Tasks'
import PrivateRoute from './components/PrivateRoute'
import RequirePermission from './components/RequirePermission'
import { useAuth } from './context/AuthContext'

export default function App() {
  const { ready, isAuthenticated } = useAuth()

  if (!ready) {
    return <div style={{ padding: '20px' }}>Loading...</div>
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Navigate to="/student/login" replace />} />
        <Route path="/student/login" element={<Login />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/onboarding"
          element={
            <PrivateRoute>
              <Onboarding />
            </PrivateRoute>
          }
        />

        <Route
          path="/app"
          element={
            <PrivateRoute requireOnboarded>
              <AppShell />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="academics" element={<Academics />} />
          <Route path="skills" element={<Skills />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="roadmaps" element={<Roadmaps />} />
          <Route path="resume" element={<Resume />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="jobs/:id" element={<JobDetails />} />
          <Route path="applications" element={<Applications />} />
          <Route path="learning" element={<Learning />} />

          <Route
            path="admin/users"
            element={
              <RequirePermission anyOf={['users:read:any']}>
                <AdminUsers />
              </RequirePermission>
            }
          />
          <Route
            path="admin/applications"
            element={
              <RequirePermission anyOf={['applications:read:any']}>
                <AdminApplications />
              </RequirePermission>
            }
          />
          <Route
            path="admin/courses"
            element={
              <RequirePermission anyOf={['learning:courses:read:any', 'learning:courses:write']}>
                <AdminCourses />
              </RequirePermission>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
