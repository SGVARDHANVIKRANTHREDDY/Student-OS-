import { useMemo, useState } from 'react'
import { useAdminCourses, useCreateCourse } from '../hooks/useApi'
import { useToast } from '../components/Toast'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import './Admin.css'

function splitSkills(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50)
}

export default function AdminCourses() {
  const toast = useToast()

  const { data: res, isLoading: loading, error: fetchError, refetch } = useAdminCourses({ status: 'APPROVED' })
  const items = res?.data?.items ?? res?.items ?? []
  const error = fetchError ? (fetchError.message || 'Failed to load courses') : ''

  const createCourse = useCreateCourse()

  const [name, setName] = useState('')
  const [externalUrl, setExternalUrl] = useState('')
  const [description, setDescription] = useState('')
  const [skills, setSkills] = useState('')

  const canCreate = useMemo(() => {
    return !!String(name || '').trim() && !!String(externalUrl || '').trim()
  }, [externalUrl, name])

  const handleCreate = () => {
    if (!canCreate) return

    createCourse.mutate(
      {
        name: String(name || '').trim(),
        externalUrl: String(externalUrl || '').trim(),
        description: String(description || '').trim(),
        skills: splitSkills(skills),
      },
      {
        onSuccess: () => {
          setName('')
          setExternalUrl('')
          setDescription('')
          setSkills('')
          toast.success('Course created!')
        },
        onError: (err) => toast.error(err.message || 'Failed to create course'),
      },
    )
  }

  return (
    <div className="admin-page">
      <h2>Admin &bull; Courses</h2>
      <p className="subtitle">
        Create curated external courses. Students see approved courses in Learning.
      </p>

      <div className="admin-create-form">
        <div className="form-title">Create course</div>

        <div className="admin-form-row">
          <div>
            <label>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="admin-input"
              placeholder="Course name"
            />
          </div>
          <div>
            <label>External URL</label>
            <input
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              className="admin-input"
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="admin-form-field">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="admin-textarea"
            placeholder="Short description (optional)"
          />
        </div>

        <div className="admin-form-field">
          <label>Skills (comma-separated)</label>
          <input
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            className="admin-input"
            placeholder="React, JavaScript, SQL"
          />
        </div>

        <div className="admin-form-actions">
          <button
            onClick={handleCreate}
            disabled={!canCreate || createCourse.isPending}
            className="admin-btn-primary"
          >
            {createCourse.isPending ? 'Creating…' : 'Create'}
          </button>
          <button onClick={() => refetch()} disabled={loading} className="admin-btn">
            Refresh
          </button>
        </div>
      </div>

      {loading && <Spinner />}
      {error && <div className="state-msg error">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <EmptyState title="No courses" message="No courses found." />
      )}

      {!loading && !error && items.length > 0 && (
        <div className="admin-card-grid">
          {items.map((c) => (
            <div key={c.id} className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">{c.name}</div>
                <div className="admin-card-meta">{c.status}</div>
              </div>
              {c.description && <div className="admin-card-desc">{c.description}</div>}
              {Array.isArray(c.skills) && c.skills.length > 0 && (
                <div className="admin-skill-pills">
                  {c.skills.map((s, idx) => (
                    <div key={`${s}-${idx}`} className="admin-skill-pill">{s}</div>
                  ))}
                </div>
              )}
              {c.externalUrl && (
                <div className="admin-course-link">
                  <a href={c.externalUrl} target="_blank" rel="noreferrer">Open course</a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
