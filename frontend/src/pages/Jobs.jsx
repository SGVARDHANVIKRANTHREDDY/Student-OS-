import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import JobMatcher from '../components/JobMatcher'
import './Jobs.css'

export default function Jobs() {
  const navigate = useNavigate()
  const { user, token } = useAuth()

  const [resume, setResume] = useState(null)
  const [resumeError, setResumeError] = useState('')

  const [q, setQ] = useState('')
  const [location, setLocation] = useState('')
  const [type, setType] = useState('')
  const [experience, setExperience] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [hasNext, setHasNext] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    if (q.trim()) params.set('q', q.trim())
    if (location.trim()) params.set('location', location.trim())
    if (type) params.set('type', type)
    if (experience.trim()) params.set('experience', experience.trim())
    return params.toString()
  }, [experience, location, page, pageSize, q, type])

  useEffect(() => {
    const loadResume = async () => {
      if (!user?.id || !token) return
      setResumeError('')
      const res = await apiFetch(`/api/resume/${user.id}`, { token })
      if (!res.ok) {
        setResume(null)
        setResumeError(res.data?.message || 'Failed to load resume')
        return
      }
      setResume(res.data)
    }

    loadResume()
  }, [token, user?.id])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await apiFetch(`/api/jobs?${query}`, { token })
        if (!res.ok) {
          setItems([])
          setTotal(0)
          setHasNext(false)
          setError(res.data?.message || 'Failed to load jobs')
          return
        }
        setItems(res.data?.items || [])
        setTotal(res.data?.total || 0)
        setHasNext(!!res.data?.hasNext)
      } catch {
        setItems([])
        setTotal(0)
        setHasNext(false)
        setError('Failed to load jobs')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [query, token])

  const resetFilters = () => {
    setQ('')
    setLocation('')
    setType('')
    setExperience('')
    setPage(1)
  }

  const toggleSave = async (job) => {
    const method = job.isSaved ? 'DELETE' : 'POST'
    const res = await apiFetch(`/api/jobs/${encodeURIComponent(job.id)}/save`, { token, method })
    if (res.ok) {
      setItems((prev) => prev.map((x) => (x.id === job.id ? { ...x, isSaved: !x.isSaved } : x)))
    }
  }

  return (
    <div className="jobs-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div>
          <h2>Jobs</h2>
          <p className="subtitle">Discover active roles, save them, and apply with tracking.</p>
        </div>
        <button className="jobs-btn secondary" onClick={() => navigate('/app/applications')}>Applications</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <JobMatcher
          userId={user?.id}
          token={token}
          resume={resume || { summary: '', education: [], skills: [], projects: [], experience: [] }}
        />
        {resumeError && (
          <div className="jobs-error" style={{ marginTop: 10 }}>
            {resumeError}. Job matching may be incomplete until your resume loads.
          </div>
        )}
      </div>

      <div className="jobs-toolbar">
        <div className="jobs-filters">
          <div>
            <label>Search</label>
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="title, company, location" />
          </div>
          <div>
            <label>Location</label>
            <input value={location} onChange={(e) => { setLocation(e.target.value); setPage(1) }} placeholder="e.g., Bengaluru" />
          </div>
          <div>
            <label>Type</label>
            <select value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}>
              <option value="">All</option>
              <option value="internship">Internship</option>
              <option value="job">Job</option>
            </select>
          </div>
          <div>
            <label>Experience</label>
            <input value={experience} onChange={(e) => { setExperience(e.target.value); setPage(1) }} placeholder="e.g., Fresher" />
          </div>
        </div>

        <div style={{ marginTop: 10 }} className="jobs-actions">
          <button className="jobs-btn secondary" onClick={resetFilters} disabled={loading}>Reset</button>
        </div>
      </div>

      {loading && <div className="jobs-state">Loading jobs…</div>}
      {error && <div className="jobs-error">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="jobs-state">No active jobs match your filters.</div>
      )}

      <div className="jobs-list">
        {items.map((job) => (
          <div key={job.id} className="job-card">
            <div>
              <div className="job-title">{job.title}</div>
              <div className="job-meta">
                <span className="job-chip">{job.company}</span>
                <span className="job-chip">{job.location}</span>
                <span className="job-chip">{job.type === 'internship' ? 'Internship' : 'Job'}</span>
                <span className="job-chip">{job.experienceLevel}</span>
                {typeof job.applicantCount === 'number' && <span className="job-chip">Applicants: {job.applicantCount}</span>}
                {typeof job.daysLeft === 'number' && <span className="job-chip">Days left: {job.daysLeft}</span>}
                {job.status && <span className="job-chip">Status: {job.status}</span>}
              </div>
            </div>

            <div className="job-cta">
              <button className="jobs-btn secondary" onClick={() => toggleSave(job)} disabled={loading}>
                {job.isSaved ? 'Saved' : 'Save'}
              </button>
              <button className="jobs-btn" onClick={() => navigate(`/app/jobs/${job.id}`)}>
                View
              </button>
            </div>
          </div>
        ))}
      </div>

      {!loading && !error && total > 0 && (
        <div className="pagination">
          <button className="jobs-btn secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </button>
          <div className="hint">Page {page} • {total} total</div>
          <button className="jobs-btn secondary" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}
