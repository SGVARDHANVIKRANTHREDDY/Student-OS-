import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import './JobDetails.css'

export default function JobDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()

  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [saving, setSaving] = useState(false)
  const [resumeVersion, setResumeVersion] = useState('')
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [applySuccess, setApplySuccess] = useState('')

  const jobId = useMemo(() => String(id || ''), [id])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`, { token })
        if (!res.ok) {
          setJob(null)
          setError(res.data?.message || 'Failed to load job')
          return
        }
        setJob(res.data)
      } catch {
        setJob(null)
        setError('Failed to load job')
      } finally {
        setLoading(false)
      }
    }

    if (jobId) load()
  }, [jobId, token])

  const toggleSave = async () => {
    if (!job) return
    setSaving(true)
    try {
      const method = job.isSaved ? 'DELETE' : 'POST'
      const res = await apiFetch(`/api/jobs/${encodeURIComponent(job.id)}/save`, { token, method })
      if (res.ok) {
        setJob({ ...job, isSaved: !job.isSaved })
      }
    } finally {
      setSaving(false)
    }
  }

  const apply = async (e) => {
    e.preventDefault()
    setApplyError('')
    setApplySuccess('')

    const v = resumeVersion.trim()
    if (!v) {
      setApplyError('Resume version is required')
      return
    }

    setApplying(true)
    try {
      const res = await apiFetch('/api/applications', {
        token,
        method: 'POST',
        body: { jobId: jobId, resumeVersion: v },
      })

      if (!res.ok) {
        setApplyError(res.data?.message || 'Application failed')
        return
      }

      setApplySuccess('Application submitted. Track status in Applications.')
      setResumeVersion('')
    } catch {
      setApplyError('Application failed')
    } finally {
      setApplying(false)
    }
  }

  const canApply = (job) => {
    if (!job) return false
    const st = String(job.status || '').trim().toUpperCase()
    if (st && st !== 'OPEN') return false
    if (typeof job.daysLeft === 'number' && job.deadlineAt) return job.daysLeft > 0
    return true
  }

  const applyBlockedReason = (job) => {
    if (!job) return ''
    const st = String(job.status || '').trim().toUpperCase()
    if (st && st !== 'OPEN') return `Applications are not open (status: ${st}).`
    if (typeof job.daysLeft === 'number' && job.deadlineAt && job.daysLeft <= 0) return 'Applications are closed (deadline passed).'
    return ''
  }

  return (
    <div className="job-details">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div>
          <h2>Job Details</h2>
          <p className="subtitle">Review role details, save, and apply with a resume version.</p>
        </div>
        <button className="jobs-btn secondary" onClick={() => navigate('/app/jobs')}>Back to Jobs</button>
      </div>

      {loading && <div className="notice">Loading job…</div>}
      {error && <div className="notice error">{error}</div>}

      {job && (
        <>
          <div className="details-card">
            <div className="details-header">
              <div>
                <h2 style={{ fontSize: 18 }}>{job.title}</h2>
                <div className="subtitle">{job.company}</div>
              </div>
              <button className="jobs-btn" disabled={saving} onClick={toggleSave}>
                {job.isSaved ? 'Saved' : 'Save'}
              </button>
            </div>

            <div className="details-meta">
              <span className="job-chip">{job.location}</span>
              <span className="job-chip">{job.type === 'internship' ? 'Internship' : 'Job'}</span>
              <span className="job-chip">{job.experienceLevel}</span>
              {typeof job.applicantCount === 'number' && <span className="job-chip">Applicants: {job.applicantCount}</span>}
              {typeof job.daysLeft === 'number' && <span className="job-chip">Days left: {job.daysLeft}</span>}
              {job.status && <span className="job-chip">Status: {job.status}</span>}
            </div>

            <div className="details-section">
              <h3>Description</h3>
              <div className="details-text">{job.description}</div>
            </div>

            <div className="details-section">
              <h3>Requirements</h3>
              <div className="details-text">{job.requirements}</div>
            </div>
          </div>

          <div className="apply-card">
            <h3 style={{ margin: 0, color: '#111827' }}>Apply</h3>
            <p className="subtitle" style={{ marginBottom: 10 }}>
              Submit an application and start tracking status.
            </p>

            {!canApply(job) && (
              <div className="notice error" style={{ marginTop: 10 }}>
                {applyBlockedReason(job)}
              </div>
            )}

            <form onSubmit={apply} className="apply-grid">
              <div>
                <label>Resume version label</label>
                <input
                  value={resumeVersion}
                  onChange={(e) => setResumeVersion(e.target.value)}
                  placeholder="e.g., Jan-2026, v3"
                />
              </div>
              <button className="jobs-btn" disabled={applying || !canApply(job)}>
                {applying ? 'Submitting…' : 'Submit application'}
              </button>
            </form>

            {applyError && <div className="notice error" style={{ marginTop: 10 }}>{applyError}</div>}
            {applySuccess && (
              <div className="notice success" style={{ marginTop: 10 }}>
                {applySuccess}{' '}
                <button
                  className="jobs-btn secondary"
                  style={{ marginLeft: 10 }}
                  type="button"
                  onClick={() => navigate('/app/applications')}
                >
                  View Applications
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
