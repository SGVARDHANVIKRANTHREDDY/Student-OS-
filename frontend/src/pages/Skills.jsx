import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

function normalizeRoleId(value) {
  const v = String(value || '').trim()
  return v || ''
}

export default function Skills() {
  const { user, token } = useAuth()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [roles, setRoles] = useState([])
  const [targetMode, setTargetMode] = useState('role')
  const [roleId, setRoleId] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [gapLoading, setGapLoading] = useState(false)
  const [gapError, setGapError] = useState('')
  const [gapResult, setGapResult] = useState(null)

  const canAnalyze = useMemo(() => {
    if (targetMode === 'role') return !!normalizeRoleId(roleId)
    return !!String(jobDescription || '').trim()
  }, [jobDescription, roleId, targetMode])

  useEffect(() => {
    const loadSkills = async () => {
      if (!token) return
      setLoading(true)
      setError('')
      const res = await apiFetch('/api/skills/me', { token })
      if (!res.ok) {
        setItems([])
        setError(res.data?.message || 'Failed to load skills')
        setLoading(false)
        return
      }
      setItems(Array.isArray(res.data?.items) ? res.data.items : [])
      setLoading(false)
    }

    loadSkills()
  }, [token])

  useEffect(() => {
    const loadRoles = async () => {
      if (!token) return
      try {
        const res = await fetch('/api/matching/roles/list', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (Array.isArray(data)) setRoles(data)
      } catch {
        // best-effort
      }
    }

    loadRoles()
  }, [token])

  const analyze = async () => {
    if (!user?.id || !token) return
    if (!canAnalyze) return

    setGapLoading(true)
    setGapError('')
    setGapResult(null)

    const body = {
      roleId: targetMode === 'role' ? normalizeRoleId(roleId) : '',
      jobDescription: targetMode === 'custom' ? String(jobDescription || '') : '',
    }

    const res = await apiFetch(`/api/skills/${encodeURIComponent(user.id)}/skill-gaps`, {
      token,
      method: 'POST',
      body,
    })

    if (!res.ok) {
      setGapError(res.data?.message || 'Failed to analyze skill gaps')
      setGapLoading(false)
      return
    }

    setGapResult(res.data)
    setGapLoading(false)
  }

  return (
    <div>
      <h2 style={{ margin: 0, color: '#111827' }}>Skills</h2>
      <p style={{ marginTop: 6, color: '#6b7280', fontSize: 13 }}>
        Your skills profile is derived from your resume and learning completions.
      </p>

      <div style={{ marginTop: 16, padding: 14, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' }}>
        <div style={{ fontWeight: 700, color: '#111827' }}>My Skills</div>
        <div style={{ marginTop: 6, color: '#6b7280', fontSize: 13 }}>
          Read-only for students.
        </div>

        {loading && <div style={{ marginTop: 12, color: '#6b7280', fontSize: 13 }}>Loading…</div>}
        {error && <div style={{ marginTop: 12, color: '#b91c1c', fontSize: 13 }}>{error}</div>}

        {!loading && !error && items.length === 0 && (
          <div style={{ marginTop: 12, color: '#6b7280', fontSize: 13 }}>
            No skills yet. Upload a resume and complete learning courses to build your profile.
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {items.map((s) => (
              <div key={s.normalizedId} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontWeight: 700, color: '#111827' }}>{s.name}</div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>{Number(s.proficiency || 0)}%</div>
                </div>
                <div style={{ marginTop: 6, color: '#6b7280', fontSize: 12 }}>
                  Source: {s.source || 'unknown'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 18, padding: 14, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' }}>
        <div style={{ fontWeight: 700, color: '#111827' }}>Skill Gap Analyzer</div>
        <div style={{ marginTop: 6, color: '#6b7280', fontSize: 13 }}>
          Compare your skills against a target role or job description.
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button
            onClick={() => setTargetMode('role')}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: targetMode === 'role' ? '#111827' : '#fff',
              color: targetMode === 'role' ? '#fff' : '#111827',
              cursor: 'pointer',
            }}
          >
            Preset Role
          </button>
          <button
            onClick={() => setTargetMode('custom')}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: targetMode === 'custom' ? '#111827' : '#fff',
              color: targetMode === 'custom' ? '#fff' : '#111827',
              cursor: 'pointer',
            }}
          >
            Custom Description
          </button>
        </div>

        {targetMode === 'role' ? (
          <div style={{ marginTop: 10 }}>
            <label style={{ display: 'block', color: '#6b7280', fontSize: 12, marginBottom: 6 }}>Role</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            >
              <option value="">Select a role…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <label style={{ display: 'block', color: '#6b7280', fontSize: 12, marginBottom: 6 }}>Job description</label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={6}
              placeholder="Paste a job description…"
              style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            />
          </div>
        )}

        <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={analyze}
            disabled={gapLoading || !canAnalyze}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #111827',
              background: '#111827',
              color: '#fff',
              cursor: gapLoading || !canAnalyze ? 'not-allowed' : 'pointer',
              opacity: gapLoading || !canAnalyze ? 0.7 : 1,
            }}
          >
            {gapLoading ? 'Analyzing…' : 'Analyze'}
          </button>
          <button
            onClick={() => {
              setGapResult(null)
              setGapError('')
            }}
            disabled={gapLoading}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #e5e7eb',
              background: '#fff',
              color: '#111827',
              cursor: gapLoading ? 'not-allowed' : 'pointer',
              opacity: gapLoading ? 0.7 : 1,
            }}
          >
            Clear
          </button>
        </div>

        {gapError && <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 13 }}>{gapError}</div>}

        {gapResult && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: '#6b7280', fontSize: 13 }}>
              <div>Covered: <strong style={{ color: '#111827' }}>{gapResult.skillsCovered}</strong></div>
              <div>To learn: <strong style={{ color: '#111827' }}>{gapResult.missingSkills?.length || 0}</strong></div>
              <div>Total: <strong style={{ color: '#111827' }}>{gapResult.totalSkillsRequired}</strong></div>
            </div>

            {(gapResult.missingSkills || []).length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, color: '#111827' }}>Skills to develop</div>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {gapResult.missingSkills.map((s, idx) => (
                    <div
                      key={`${s.name}-${idx}`}
                      style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontSize: 12 }}
                    >
                      {s.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
