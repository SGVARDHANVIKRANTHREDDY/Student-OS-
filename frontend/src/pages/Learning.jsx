import { useState } from 'react'
import { useLearningCourses, useCompleteCourse } from '../hooks/useApi'
import { useToast } from '../components/Toast'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import './Learning.css'

export default function Learning() {
  const toast = useToast()

  const { data: res, isLoading: loading, error: fetchError } = useLearningCourses()
  const items = res?.data?.items ?? res?.items ?? []
  const error = fetchError ? (fetchError.message || 'Failed to load courses') : ''

  const completeCourse = useCompleteCourse()
  const [completed, setCompleted] = useState(() => new Set())

  const markComplete = (courseId) => {
    const id = Number(courseId)
    if (!Number.isFinite(id)) return

    completeCourse.mutate(id, {
      onSuccess: () => {
        setCompleted((prev) => {
          const next = new Set(prev)
          next.add(id)
          return next
        })
        toast.success('Course marked complete!')
      },
      onError: (err) => toast.error(err.message || 'Failed to mark course complete'),
    })
  }

  return (
    <div className="learning-page">
      <h2>Learning</h2>
      <p className="subtitle">
        Curated courses approved by operators. Completing a course updates your skills profile.
      </p>

      {completed.size > 0 && (
        <div className="session-count">Completed this session: {completed.size}</div>
      )}

      {loading && <Spinner />}
      {error && <div className="state-msg error">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <EmptyState title="No courses" message="No courses available yet." />
      )}

      {!loading && !error && items.length > 0 && (
        <div className="courses-grid">
          {items.map((c) => {
            const isDone = completed.has(Number(c.id))
            return (
              <div key={c.id} className="course-card">
                <div className="course-header">
                  <div className="course-name">{c.name}</div>
                  <div className="course-status">{c.status}</div>
                </div>

                {c.description && <div className="course-desc">{c.description}</div>}

                {Array.isArray(c.skills) && c.skills.length > 0 && (
                  <div className="course-skills">
                    {c.skills.map((s, idx) => (
                      <div key={`${s}-${idx}`} className="course-skill-pill">{s}</div>
                    ))}
                  </div>
                )}

                <div className="course-actions">
                  {c.externalUrl ? (
                    <a href={c.externalUrl} target="_blank" rel="noreferrer" className="course-link">
                      Open
                    </a>
                  ) : (
                    <div className="course-no-link">No link</div>
                  )}

                  <button
                    onClick={() => markComplete(c.id)}
                    disabled={isDone || (completeCourse.isPending && completeCourse.variables === Number(c.id))}
                    className={`course-complete-btn${isDone ? ' done' : ''}`}
                  >
                    {isDone ? 'Completed' : (completeCourse.isPending && completeCourse.variables === Number(c.id)) ? 'Completing…' : 'Mark complete'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
