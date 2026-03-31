import { useMemo, useState } from 'react'
import { useAdminApplications, useUpdateApplicationStatus } from '../hooks/useApi'
import { useToast } from '../components/Toast'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import './Admin.css'

function normalizeStatus(value) {
  const v = String(value || '').trim().toUpperCase()
  return v || ''
}

export default function AdminApplications() {
  const toast = useToast()

  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [status, setStatus] = useState('')

  const filters = useMemo(() => {
    const f = { page: String(page), pageSize: String(pageSize) }
    if (status) f.status = status
    return f
  }, [page, pageSize, status])

  const { data: res, isLoading: loading, error: fetchError } = useAdminApplications(filters)
  const items = res?.data?.items ?? res?.items ?? []
  const error = fetchError ? (fetchError.message || 'Failed to load applications') : ''

  const updateStatus = useUpdateApplicationStatus()

  const counts = useMemo(() => {
    const map = new Map()
    for (const a of items) {
      const s = normalizeStatus(a?.status)
      map.set(s, (map.get(s) || 0) + 1)
    }
    return map
  }, [items])

  const handleUpdateStatus = (applicationId, nextStatus) => {
    const id = String(applicationId || '').trim()
    const st = normalizeStatus(nextStatus)
    if (!id || !st) return

    updateStatus.mutate(
      { id, status: st },
      {
        onSuccess: () => toast.success('Status updated'),
        onError: (err) => toast.error(err.message || 'Failed to update status'),
      },
    )
  }

  return (
    <div className="admin-page">
      <h2>Admin &bull; Applications</h2>
      <p className="subtitle">
        View and update tenant-scoped application statuses.
      </p>

      <div className="admin-filters">
        <div>
          <label>Status</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            className="admin-select"
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
          className="admin-btn"
        >
          Reset
        </button>
      </div>

      {!loading && !error && items.length > 0 && (
        <div className="admin-chips">
          <span className="admin-chip">On this page: {items.length}</span>
          {['APPLIED', 'SHORTLISTED', 'SELECTED', 'OFFERED', 'REJECTED'].map((k) => (
            <span key={k} className="admin-chip">{k}: {counts.get(k) || 0}</span>
          ))}
        </div>
      )}

      {loading && <Spinner />}
      {error && <div className="state-msg error">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <EmptyState title="No applications" message="No applications found." />
      )}

      {!loading && !error && items.length > 0 && (
        <div className="admin-card-grid">
          {items.map((a) => (
            <div key={a.id} className="admin-card">
              <div className="admin-card-header">
                <div>
                  <div className="admin-card-title">Application</div>
                  <div className="admin-card-meta">id: {a.id}</div>
                </div>
                <div className="admin-card-meta">Status: {a.status}</div>
              </div>

              <div className="admin-detail-grid">
                <div>jobId: <span className="val">{a.job_id}</span></div>
                <div>userId: <span className="val">{a.user_id}</span></div>
                <div>created: <span className="val">{a.created_at}</span></div>
                <div>updated: <span className="val">{a.updated_at}</span></div>
              </div>

              <div className="admin-status-row">
                <select
                  defaultValue={a.status}
                  disabled={updateStatus.isPending}
                  onChange={(e) => handleUpdateStatus(a.id, e.target.value)}
                  className="admin-select"
                >
                  <option value="APPLIED">APPLIED</option>
                  <option value="SHORTLISTED">SHORTLISTED</option>
                  <option value="SELECTED">SELECTED</option>
                  <option value="OFFERED">OFFERED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
                {updateStatus.isPending && <div className="admin-updating-hint">Updating…</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div className="admin-pagination">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="admin-btn"
          >
            Previous
          </button>
          <div className="admin-page-label">Page {page}</div>
          <button
            onClick={() => setPage((p) => p + 1)}
            className="admin-btn"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
