import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

function normalizeStatus(value) {
  const v = String(value || '').trim().toUpperCase()
  return v || ''
}

export default function AdminApplications() {
  const { token } = useAuth()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [status, setStatus] = useState('')
  const [updatingId, setUpdatingId] = useState(null)

  const counts = useMemo(() => {
    const map = new Map()
    for (const a of items) {
      const s = normalizeStatus(a?.status)
      map.set(s, (map.get(s) || 0) + 1)
    }
    return map
  }, [items])

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    if (status) params.set('status', status)
    return params.toString()
  }, [page, pageSize, status])

  useEffect(() => {
    const load = async () => {
      if (!token) return
      setLoading(true)
      setError('')
      const res = await apiFetch(`/api/applications/admin?${query}`, { token })
      if (!res.ok) {
        setItems([])
        setError(res.data?.message || 'Failed to load applications')
        setLoading(false)
        return
      }
      setItems(Array.isArray(res.data?.items) ? res.data.items : [])
      setLoading(false)
    }

    load()
  }, [query, token])

  const updateStatus = async (applicationId, nextStatus) => {
    if (!token) return
    const id = String(applicationId || '').trim()
    const st = normalizeStatus(nextStatus)
    if (!id || !st) return

    setUpdatingId(id)
    setError('')
    const res = await apiFetch(`/api/applications/${encodeURIComponent(id)}/status`, {
      token,
      method: 'PATCH',
      body: { status: st },
    })
    setUpdatingId(null)

    if (!res.ok) {
      setError(res.data?.message || 'Failed to update status')
      return
    }

    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status: res.data?.application?.status || st } : a)))
  }

  return (
    <div>
      <h2 style={{ margin: 0, color: '#111827' }}>Admin • Applications</h2>
      <p style={{ marginTop: 6, color: '#6b7280', fontSize: 13 }}>
        View and update tenant-scoped application statuses.
      </p>

      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', color: '#6b7280', fontSize: 12, marginBottom: 6 }}>Status</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
          >
            <option value="">All</option>
            <option value="APPLIED">APPLIED</option>
            <option value="SHORTLISTED">SHORTLISTED</option>
            <option value="SELECTED">SELECTED</option>
            <option value="OFFERED">OFFERED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </div>

        <button
          onClick={() => {
            setStatus('')
            setPage(1)
          }}
          disabled={loading}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #e5e7eb',
            background: '#fff',
            color: '#111827',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          Reset
        </button>
      </div>

      {!loading && !error && items.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, color: '#6b7280', fontSize: 12 }}>
          <span style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff' }}>
            On this page: {items.length}
          </span>
          {['APPLIED', 'SHORTLISTED', 'SELECTED', 'OFFERED', 'REJECTED'].map((k) => (
            <span key={k} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff' }}>
              {k}: {counts.get(k) || 0}
            </span>
          ))}
        </div>
      )}

      {loading && <div style={{ marginTop: 16, color: '#6b7280', fontSize: 13 }}>Loading…</div>}
      {error && <div style={{ marginTop: 16, color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div style={{ marginTop: 16, color: '#6b7280', fontSize: 13 }}>No applications found.</div>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          {items.map((a) => (
            <div key={a.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#111827', fontWeight: 800 }}>Application</div>
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
                    id: {a.id}
                  </div>
                </div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>Status: {a.status}</div>
              </div>

              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, color: '#6b7280', fontSize: 12 }}>
                <div>jobId: <span style={{ color: '#111827' }}>{a.job_id}</span></div>
                <div>userId: <span style={{ color: '#111827' }}>{a.user_id}</span></div>
                <div>created: <span style={{ color: '#111827' }}>{a.created_at}</span></div>
                <div>updated: <span style={{ color: '#111827' }}>{a.updated_at}</span></div>
              </div>

              <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  defaultValue={a.status}
                  disabled={updatingId === a.id}
                  onChange={(e) => updateStatus(a.id, e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
                >
                  <option value="APPLIED">APPLIED</option>
                  <option value="SHORTLISTED">SHORTLISTED</option>
                  <option value="SELECTED">SELECTED</option>
                  <option value="OFFERED">OFFERED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
                {updatingId === a.id && <div style={{ color: '#6b7280', fontSize: 12 }}>Updating…</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff' }}
          >
            Previous
          </button>
          <div style={{ color: '#6b7280', fontSize: 13 }}>Page {page}</div>
          <button
            onClick={() => setPage((p) => p + 1)}
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
