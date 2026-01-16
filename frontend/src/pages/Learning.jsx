import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

export default function Learning() {
  const { token } = useAuth()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [completed, setCompleted] = useState(() => new Set())
  const [completingId, setCompletingId] = useState(null)

  const completedCount = useMemo(() => completed.size, [completed])

  useEffect(() => {
    const load = async () => {
      if (!token) return
      setLoading(true)
      setError('')
      const res = await apiFetch('/api/learning/courses', { token })
      if (!res.ok) {
        setItems([])
        setError(res.data?.message || 'Failed to load courses')
        setLoading(false)
        return
      }
      setItems(Array.isArray(res.data?.items) ? res.data.items : [])
      setLoading(false)
    }

    load()
  }, [token])

  const markComplete = async (courseId) => {
    if (!token) return
    const id = Number(courseId)
    if (!Number.isFinite(id)) return

    setCompletingId(id)
    const res = await apiFetch(`/api/learning/courses/${id}/complete`, { token, method: 'POST', body: {} })
    setCompletingId(null)
    if (!res.ok) {
      setError(res.data?.message || 'Failed to mark course complete')
      return
    }

    setCompleted((prev) => {
      const next = new Set(Array.from(prev))
      next.add(id)
      return next
    })
  }

  return (
    <div>
      <h2 style={{ margin: 0, color: '#111827' }}>Learning</h2>
      <p style={{ marginTop: 6, color: '#6b7280', fontSize: 13 }}>
        Curated courses approved by operators. Completing a course updates your skills profile.
      </p>

      {completedCount > 0 && (
        <div style={{ marginTop: 10, color: '#6b7280', fontSize: 13 }}>
          Completed this session: {completedCount}
        </div>
      )}

      {loading && <div style={{ marginTop: 16, color: '#6b7280', fontSize: 13 }}>Loading courses…</div>}
      {error && <div style={{ marginTop: 16, color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div style={{ marginTop: 16, color: '#6b7280', fontSize: 13 }}>
          No courses available yet.
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {items.map((c) => {
            const isDone = completed.has(Number(c.id))
            return (
              <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontWeight: 800, color: '#111827' }}>{c.name}</div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>{c.status}</div>
                </div>

                {c.description && (
                  <div style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>
                    {c.description}
                  </div>
                )}

                {Array.isArray(c.skills) && c.skills.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {c.skills.map((s, idx) => (
                      <div key={`${s}-${idx}`} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #e5e7eb', fontSize: 12 }}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                  {c.externalUrl ? (
                    <a
                      href={c.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-block',
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid #e5e7eb',
                        background: '#fff',
                        color: '#111827',
                        textDecoration: 'none',
                        fontSize: 13,
                      }}
                    >
                      Open
                    </a>
                  ) : (
                    <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', color: '#6b7280', fontSize: 13 }}>
                      No link
                    </div>
                  )}

                  <button
                    onClick={() => markComplete(c.id)}
                    disabled={isDone || completingId === Number(c.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #111827',
                      background: isDone ? '#fff' : '#111827',
                      color: isDone ? '#111827' : '#fff',
                      cursor: isDone || completingId === Number(c.id) ? 'not-allowed' : 'pointer',
                      opacity: completingId === Number(c.id) ? 0.7 : 1,
                      fontSize: 13,
                    }}
                  >
                    {isDone ? 'Completed' : completingId === Number(c.id) ? 'Completing…' : 'Mark complete'}
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
