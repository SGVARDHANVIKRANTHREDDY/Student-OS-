import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import { queryKeys } from '../lib/queryClient'
import { useToast } from '../components/Toast'
import JobMatcher from '../components/JobMatcher'
import './Jobs.css'

export default function Jobs() {
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [q, setQ] = useState('')
  const [location, setLocation] = useState('')
  const [type, setType] = useState('')
  const [experience, setExperience] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

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

  const { data: resume, error: resumeError } = useQuery({
    queryKey: queryKeys.resume(user?.id),
    queryFn: () => api.get(`/api/resume/${encodeURIComponent(user.id)}`, token),
    enabled: !!user?.id && !!token,
  })

  const { data: jobsData, isLoading: loading, error } = useQuery({
    queryKey: [...queryKeys.jobs(), query],
    queryFn: () => api.get(`/api/jobs?${query}`, token),
    enabled: !!token,
    keepPreviousData: true,
  })

  const items = jobsData?.data?.items ?? jobsData?.items ?? []
  const total = jobsData?.data?.total ?? jobsData?.total ?? 0
  const hasNext = jobsData?.data?.hasNext ?? jobsData?.hasNext ?? false

  const saveMutation = useMutation({
    mutationFn: ({ jobId, isSaved }) => {
      const method = isSaved ? 'delete' : 'post'
      return api[method](`/api/jobs/${encodeURIComponent(jobId)}/save`, token)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs() })
    },
    onError: () => {
      toast.error('Failed to save job')
    },
  })

  const toggleSave = (job) => saveMutation.mutate({ jobId: job.id, isSaved: job.isSaved })

  const resetFilters = () => {
    setQ('')
    setLocation('')
    setType('')
    setExperience('')
    setPage(1)
  }

  return (
    <div className="jobs-page">
      <div className="page-header">
        <div>
          <h2>Jobs</h2>
          <p className="subtitle">Discover active roles, save them, and apply with tracking.</p>
        </div>
        <button className="jobs-btn secondary" onClick={() => navigate('/app/applications')}>Applications</button>
      </div>

      <div className="jobs-matcher-wrap">
        <JobMatcher
          userId={user?.id}
          token={token}
          resume={resume?.data ?? resume ?? { summary: '', education: [], skills: [], projects: [], experience: [] }}
        />
        {resumeError && (
          <div className="jobs-error">
            Failed to load resume. Job matching may be incomplete until your resume loads.
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

        <div className="jobs-actions">
          <button className="jobs-btn secondary" onClick={resetFilters} disabled={loading}>Reset</button>
        </div>
      </div>

      {loading && <div className="jobs-state">Loading jobs…</div>}
      {error && <div className="jobs-error">{error.message || 'Failed to load jobs'}</div>}

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
