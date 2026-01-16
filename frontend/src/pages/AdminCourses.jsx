import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

function splitSkills(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50)
}

export default function AdminCourses() {
  const { token } = useAuth()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [externalUrl, setExternalUrl] = useState('')
  const [description, setDescription] = useState('')
  const [skills, setSkills] = useState('')
  const [saving, setSaving] = useState(false)

  const canCreate = useMemo(() => {
    return !!String(name || '').trim() && !!String(externalUrl || '').trim()
  }, [externalUrl, name])

  const load = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    const res = await apiFetch('/api/learning/courses/admin?status=APPROVED', { token })
    if (!res.ok) {
      setItems([])
      setError(res.data?.message || 'Failed to load courses')
      setLoading(false)
      return
    }
    setItems(Array.isArray(res.data?.items) ? res.data.items : [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const createCourse = async () => {
    if (!token) return
    if (!canCreate) return

    setSaving(true)
    setError('')
    const res = await apiFetch('/api/learning/courses', {
      token,
      method: 'POST',
      body: {
        name: String(name || '').trim(),
        externalUrl: String(externalUrl || '').trim(),
        description: String(description || '').trim(),
        skills: splitSkills(skills),
      },
    })
    setSaving(false)

    if (!res.ok) {
      setError(res.data?.message || 'Failed to create course')
      return
    }

    setName('')
    setExternalUrl('')
    setDescription('')
    setSkills('')
    await load()
  }

  return (
    <div>
      <h2 style={{ margin: 0, color: '#111827' }}>Admin • Courses</h2>
      <p style={{ marginTop: 6, color: '#6b7280', fontSize: 13 }}>
        Create curated external courses. Students see approved courses in Learning.
      </p>

      <div style={{ marginTop: 14, padding: 14, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
        <div style={{ fontWeight: 800, color: '#111827' }}>Create course</div>

        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ display: 'block', color: '#6b7280', fontSize: 12, marginBottom: 6 }}>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
              placeholder="Course name"
            />
          </div>
          <div>
            <label style={{ display: 'block', color: '#6b7280', fontSize: 12, marginBottom: 6 }}>External URL</label>
            <input
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
              placeholder="https://…"
            />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={{ display: 'block', color: '#6b7280', fontSize: 12, marginBottom: 6 }}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            placeholder="Short description (optional)"
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={{ display: 'block', color: '#6b7280', fontSize: 12, marginBottom: 6 }}>Skills (comma-separated)</label>
          <input
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            placeholder="React, JavaScript, SQL"
          />
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
          <button
            onClick={createCourse}
            disabled={!canCreate || saving}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #111827',
              background: '#111827',
              color: '#fff',
              cursor: !canCreate || saving ? 'not-allowed' : 'pointer',
              opacity: !canCreate || saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
          <button
            onClick={load}
            disabled={loading}
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff' }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <div style={{ marginTop: 16, color: '#6b7280', fontSize: 13 }}>Loading…</div>}
      {error && <div style={{ marginTop: 16, color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div style={{ marginTop: 16, color: '#6b7280', fontSize: 13 }}>No courses found.</div>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          {items.map((c) => (
            <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontWeight: 800, color: '#111827' }}>{c.name}</div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>{c.status}</div>
              </div>
              {c.description && <div style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>{c.description}</div>}
              {Array.isArray(c.skills) && c.skills.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {c.skills.map((s, idx) => (
                    <div key={`${s}-${idx}`} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #e5e7eb', fontSize: 12 }}>
                      {s}
                    </div>
                  ))}
                </div>
              )}
              {c.externalUrl && (
                <div style={{ marginTop: 12 }}>
                  <a href={c.externalUrl} target="_blank" rel="noreferrer" style={{ color: '#111827', fontSize: 13 }}>
                    Open course
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
