import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useJob, useSaveJob, useUnsaveJob, useCreateApplication } from '../hooks/useApi'
import { useToast } from '../components/Toast'
import Spinner from '../components/Spinner'
import './JobDetails.css'

export default function JobDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const { data: jobRes, isLoading: loading, error: fetchError } = useJob(id)
  const job = jobRes?.data ?? jobRes ?? null

  const saveJob = useSaveJob()
  const unsaveJob = useUnsaveJob()
  const createApplication = useCreateApplication()

  const [resumeVersion, setResumeVersion] = useState('')
  const [applySuccess, setApplySuccess] = useState('')

  const error = fetchError ? (fetchError.message || 'Failed to load job') : ''

  const toggleSave = () => {
    if (!job) return
    const mutation = job.isSaved ? unsaveJob : saveJob
    mutation.mutate(job.id)
  }

  const apply = (e) => {
    e.preventDefault()
    setApplySuccess('')

    const v = resumeVersion.trim()
    if (!v) {
      toast.error('Resume version is required')
      return
    }

    createApplication.mutate(
      { jobId: String(id), resumeVersion: v },
      {
        onSuccess: () => {
          setApplySuccess('Application submitted. Track status in Applications.')
          setResumeVersion('')
          toast.success('Application submitted!')
        },
        onError: (err) => {
          toast.error(err.message || 'Application failed')
        },
      },
    )
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
      <div className="page-header">
        <div>
          <h2>Job Details</h2>
          <p className="subtitle">Review role details, save, and apply with a resume version.</p>
        </div>
        <button className="jobs-btn secondary" onClick={() => navigate('/app/jobs')}>Back to Jobs</button>
      </div>

      {loading && <Spinner />}
      {error && <div className="notice error">{error}</div>}

      {job && (
        <>
          <div className="details-card">
            <div className="details-header">
              <div>
                <h2 className="details-title">{job.title}</h2>
                <div className="subtitle">{job.company}</div>
              </div>
              <button className="jobs-btn" disabled={saveJob.isPending || unsaveJob.isPending} onClick={toggleSave}>
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
            <h3>Apply</h3>
            <p className="subtitle">
              Submit an application and start tracking status.
            </p>

            {!canApply(job) && (
              <div className="notice error">
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
              <button className="jobs-btn" disabled={createApplication.isPending || !canApply(job)}>
                {createApplication.isPending ? 'Submitting…' : 'Submit application'}
              </button>
            </form>

            {createApplication.isError && <div className="notice error">{createApplication.error?.message || 'Application failed'}</div>}
            {applySuccess && (
              <div className="notice success">
                {applySuccess}{' '}
                <button
                  className="jobs-btn secondary"
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
