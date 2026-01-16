import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import './Applications.css'

export default function Applications() {
  const navigate = useNavigate()
  const { token } = useAuth()

  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [hasNext, setHasNext] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await apiFetch(`/api/applications?page=${page}&pageSize=${pageSize}`, { token })
        if (!res.ok) {
          setItems([])
          setError(res.data?.message || 'Failed to load applications')
          return
        }
        setItems(res.data?.items || [])
        setTotal(res.data?.total || 0)
        setHasNext(!!res.data?.hasNext)
      } catch {
        setItems([])
        setError('Failed to load applications')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [page, pageSize, token])

  const statusLabel = (raw) => {
    const s = String(raw || '').trim().toUpperCase()
    if (s === 'APPLIED') return 'Applied'
    if (s === 'SHORTLISTED') return 'In review'
    if (s === 'SELECTED') return 'Selected'
    if (s === 'OFFERED') return 'Selected'
    if (s === 'REJECTED') return 'Rejected'
    return s || 'Unknown'
  }

  const statusExplain = (raw) => {
    const s = String(raw || '').trim().toUpperCase()
    if (s === 'APPLIED') return 'Submitted successfully. Awaiting review by admins.'
    if (s === 'SHORTLISTED') return 'You are shortlisted. Admins may request next steps soon.'
    if (s === 'SELECTED' || s === 'OFFERED') return 'Selected. Watch notifications for next steps.'
    if (s === 'REJECTED') return 'Not selected for this role. You can keep applying to other jobs.'
    return 'Status updated.'
  }

  const statusClass = (raw) => {
    const s = String(raw || '').trim().toUpperCase()
    return s || 'UNKNOWN'
  }

  return (
    <div className="applications">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div>
          <h2>Applications</h2>
          <p className="subtitle">Track your applications across internships and jobs.</p>
        </div>
        <button className="jobs-btn secondary" onClick={() => navigate('/app/jobs')}>Discover Jobs</button>
      </div>

      {loading && <div className="page-state">Loading applications…</div>}
      {error && <div className="page-error">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="page-state">
          No applications yet. Apply to a job to start tracking.
        </div>
      )}

      <div className="applications-list">
        {items.map((a) => (
          <div key={a.id} className="application-card">
            <div>
              <div className="application-title">{a.job?.title}</div>
              <div className="application-meta">
                <span className="job-chip">{a.job?.company}</span>
                <span className="job-chip">{a.job?.location}</span>
                <span className="job-chip">{a.job?.type === 'internship' ? 'Internship' : 'Job'}</span>
                <span className="job-chip">{a.job?.experienceLevel}</span>
                <span className="job-chip">Resume: {a.resumeVersion}</span>
              </div>
              <div className="application-meta" style={{ marginTop: 8 }}>
                <span className="job-chip">Applied: {new Date(a.appliedAt).toLocaleString()}</span>
                <span className="job-chip">Updated: {new Date(a.updatedAt).toLocaleString()}</span>
              </div>
              <div className="application-meta" style={{ marginTop: 8 }}>
                <span className="job-chip">{statusExplain(a.status)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className={`status ${statusClass(a.status)}`}>{statusLabel(a.status)}</span>
              <button className="jobs-btn" onClick={() => navigate(`/app/jobs/${a.jobId}`)}>View</button>
            </div>
          </div>
        ))}
      </div>

      {!loading && !error && total > 0 && (
        <div className="pagination">
          <button className="jobs-btn secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </button>
          <div className="hint">Page {page}</div>
          <button className="jobs-btn secondary" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}
