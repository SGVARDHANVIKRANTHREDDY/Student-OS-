import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

export default function AdminUsers() {
  const { token } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!token) return
      setLoading(true)
      setError('')
      const res = await apiFetch('/api/admin/users?limit=200&offset=0', { token })
      if (!res.ok) {
        setItems([])
        setError(res.data?.message || 'Failed to load users')
        setLoading(false)
        return
      }
      setItems(Array.isArray(res.data?.items) ? res.data.items : [])
      setLoading(false)
    }

    load()
  }, [token])

  const exportCsv = async () => {
    if (!token) return
    setExporting(true)
    setError('')
    try {
      const res = await fetch('/api/admin/users/export.csv', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(txt || 'Export failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'users.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(String(e?.message || 'Export failed'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, color: '#111827' }}>Admin • Users</h2>
          <p style={{ marginTop: 6, color: '#6b7280', fontSize: 13 }}>Tenant-scoped user list.</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={exporting}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #111827',
            background: '#111827',
            color: '#fff',
            cursor: exporting ? 'not-allowed' : 'pointer',
            opacity: exporting ? 0.7 : 1,
          }}
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {loading && <div style={{ marginTop: 16, color: '#6b7280', fontSize: 13 }}>Loading…</div>}
      {error && <div style={{ marginTop: 16, color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div style={{ marginTop: 16, color: '#6b7280', fontSize: 13 }}>No users found.</div>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: 10, padding: 12, background: '#f9fafb', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>
            <div>Email</div>
            <div>Name</div>
            <div>Roles</div>
          </div>
          {items.map((u) => (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: 10, padding: 12, borderTop: '1px solid #e5e7eb' }}>
              <div style={{ color: '#111827', fontSize: 13 }}>{u.email}</div>
              <div style={{ color: '#111827', fontSize: 13 }}>{u.name}</div>
              <div style={{ color: '#6b7280', fontSize: 13 }}>{(u.roles || []).join(', ') || '—'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
