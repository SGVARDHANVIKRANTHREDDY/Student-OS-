import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAdminUsers } from '../hooks/useApi'
import { useToast } from '../components/Toast'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import './Admin.css'

export default function AdminUsers() {
  const { token } = useAuth()
  const toast = useToast()
  const [exporting, setExporting] = useState(false)

  const { data: res, isLoading: loading, error: fetchError } = useAdminUsers({ limit: '200', offset: '0' })
  const items = res?.data?.items ?? res?.items ?? []
  const error = fetchError ? (fetchError.message || 'Failed to load users') : ''

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
      toast.error(String(e?.message || 'Export failed'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h2>Admin &bull; Users</h2>
          <p className="subtitle">Tenant-scoped user list.</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={exporting}
          className="admin-btn-primary"
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {loading && <Spinner />}
      {error && <div className="state-msg error">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <EmptyState title="No users" message="No users found." />
      )}

      {!loading && !error && items.length > 0 && (
        <div className="admin-table">
          <div className="admin-table-head">
            <div>Email</div>
            <div>Name</div>
            <div>Roles</div>
          </div>
          {items.map((u) => (
            <div key={u.id} className="admin-table-row">
              <div className="cell">{u.email}</div>
              <div className="cell">{u.name}</div>
              <div className="cell-muted">{(u.roles || []).join(', ') || '—'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
