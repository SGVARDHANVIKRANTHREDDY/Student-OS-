import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/AppShell'
import PrivateRoute from './components/PrivateRoute'
import RequirePermission from './components/RequirePermission'
import { useAuth } from './context/AuthContext'

// Lazy-loaded pages for code splitting
const Landing = lazy(() => import('./pages/Landing'))
const Login = lazy(() => import('./pages/Login'))
const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const Signup = lazy(() => import('./pages/Signup'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Academics = lazy(() => import('./pages/Academics'))
const Skills = lazy(() => import('./pages/Skills'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Roadmaps = lazy(() => import('./pages/Roadmaps'))
const Resume = lazy(() => import('./pages/Resume'))
const Jobs = lazy(() => import('./pages/Jobs'))
const JobDetails = lazy(() => import('./pages/JobDetails'))
const Applications = lazy(() => import('./pages/Applications'))
const Learning = lazy(() => import('./pages/Learning'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminApplications = lazy(() => import('./pages/AdminApplications'))
const AdminCourses = lazy(() => import('./pages/AdminCourses'))

function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '200px',
      gap: '12px',
      color: 'var(--color-text-muted, #94a3b8)',
      fontSize: '14px',
    }}>
      <div style={{
        width: 20,
        height: 20,
        border: '2px solid var(--color-border, #e2e8f0)',
        borderTopColor: 'var(--color-primary, #6366f1)',
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite',
      }} />
      Loading…
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function AppLoader() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--color-bg, #f8fafc)',
      flexDirection: 'column',
      gap: '16px',
    }}>
      <div style={{
        width: 40,
        height: 40,
        background: 'var(--gradient-brand, linear-gradient(135deg, #6366f1, #8b5cf6))',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 800,
        fontSize: 18,
      }}>S</div>
      <div style={{
        width: 24,
        height: 24,
        border: '2px solid var(--color-border, #e2e8f0)',
        borderTopColor: 'var(--color-primary, #6366f1)',
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default function App() {
  const { ready, isAuthenticated } = useAuth()

  if (!ready) return <AppLoader />

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
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
            <Route index element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
            <Route path="academics" element={<Suspense fallback={<PageLoader />}><Academics /></Suspense>} />
            <Route path="skills" element={<Suspense fallback={<PageLoader />}><Skills /></Suspense>} />
            <Route path="tasks" element={<Suspense fallback={<PageLoader />}><Tasks /></Suspense>} />
            <Route path="roadmaps" element={<Suspense fallback={<PageLoader />}><Roadmaps /></Suspense>} />
            <Route path="resume" element={<Suspense fallback={<PageLoader />}><Resume /></Suspense>} />
            <Route path="jobs" element={<Suspense fallback={<PageLoader />}><Jobs /></Suspense>} />
            <Route path="jobs/:id" element={<Suspense fallback={<PageLoader />}><JobDetails /></Suspense>} />
            <Route path="applications" element={<Suspense fallback={<PageLoader />}><Applications /></Suspense>} />
            <Route path="learning" element={<Suspense fallback={<PageLoader />}><Learning /></Suspense>} />

            <Route
              path="admin/users"
              element={
                <RequirePermission anyOf={['users:read:any']}>
                  <Suspense fallback={<PageLoader />}><AdminUsers /></Suspense>
                </RequirePermission>
              }
            />
            <Route
              path="admin/applications"
              element={
                <RequirePermission anyOf={['applications:read:any']}>
                  <Suspense fallback={<PageLoader />}><AdminApplications /></Suspense>
                </RequirePermission>
              }
            />
            <Route
              path="admin/courses"
              element={
                <RequirePermission anyOf={['learning:courses:read:any', 'learning:courses:write']}>
                  <Suspense fallback={<PageLoader />}><AdminCourses /></Suspense>
                </RequirePermission>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
