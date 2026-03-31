import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSkills, useMatchingRoles, useSkillGapAnalysis } from '../hooks/useApi'
import { useToast } from '../components/Toast'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import './Skills.css'

function normalizeRoleId(value) {
  const v = String(value || '').trim()
  return v || ''
}

export default function Skills() {
  const { user } = useAuth()
  const toast = useToast()

  const { data: skillsRes, isLoading: loading, error: fetchError } = useSkills()
  const items = skillsRes?.data?.items ?? skillsRes?.items ?? []
  const error = fetchError ? (fetchError.message || 'Failed to load skills') : ''

  const { data: rolesRes } = useMatchingRoles()
  const roles = rolesRes?.data ?? (Array.isArray(rolesRes) ? rolesRes : [])

  const gapAnalysis = useSkillGapAnalysis()

  const [targetMode, setTargetMode] = useState('role')
  const [roleId, setRoleId] = useState('')
  const [jobDescription, setJobDescription] = useState('')

  const canAnalyze = useMemo(() => {
    if (targetMode === 'role') return !!normalizeRoleId(roleId)
    return !!String(jobDescription || '').trim()
  }, [jobDescription, roleId, targetMode])

  const analyze = () => {
    if (!user?.id || !canAnalyze) return

    const body = {
      userId: user.id,
      roleId: targetMode === 'role' ? normalizeRoleId(roleId) : '',
      jobDescription: targetMode === 'custom' ? String(jobDescription || '') : '',
    }

    gapAnalysis.mutate(body, {
      onError: (err) => toast.error(err.message || 'Failed to analyze skill gaps'),
    })
  }

  return (
    <div className="skills-page">
      <h2>Skills</h2>
      <p className="subtitle">
        Your skills profile is derived from your resume and learning completions.
      </p>

      <div className="skills-card">
        <div className="skills-card-title">My Skills</div>
        <div className="skills-card-desc">
          Read-only for students.
        </div>

        {loading && <Spinner size="sm" />}
        {error && <div className="skills-state error">{error}</div>}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            title="No skills yet"
            message="Upload a resume and complete learning courses to build your profile."
          />
        )}

        {!loading && !error && items.length > 0 && (
          <div className="skills-grid">
            {items.map((s) => (
              <div key={s.normalizedId} className="skill-item">
                <div className="skill-item-header">
                  <div className="skill-item-name">{s.name}</div>
                  <div className="skill-item-proficiency">{Number(s.proficiency || 0)}%</div>
                </div>
                <div className="skill-item-source">
                  Source: {s.source || 'unknown'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="gap-analyzer">
        <div className="skills-card-title">Skill Gap Analyzer</div>
        <div className="skills-card-desc">
          Compare your skills against a target role or job description.
        </div>

        <div className="gap-mode-toggle">
          <button
            onClick={() => setTargetMode('role')}
            className={`gap-mode-btn${targetMode === 'role' ? ' active' : ''}`}
          >
            Preset Role
          </button>
          <button
            onClick={() => setTargetMode('custom')}
            className={`gap-mode-btn${targetMode === 'custom' ? ' active' : ''}`}
          >
            Custom Description
          </button>
        </div>

        {targetMode === 'role' ? (
          <div className="gap-field">
            <label>Role</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
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
          <div className="gap-field">
            <label>Job description</label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={6}
              placeholder="Paste a job description…"
            />
          </div>
        )}

        <div className="gap-actions">
          <button
            onClick={analyze}
            disabled={gapAnalysis.isPending || !canAnalyze}
            className="gap-btn-primary"
          >
            {gapAnalysis.isPending ? 'Analyzing…' : 'Analyze'}
          </button>
          <button
            onClick={() => gapAnalysis.reset()}
            disabled={gapAnalysis.isPending}
            className="gap-btn-secondary"
          >
            Clear
          </button>
        </div>

        {gapAnalysis.isError && <div className="gap-error">{gapAnalysis.error?.message || 'Analysis failed'}</div>}

        {gapAnalysis.data && (() => {
          const gapResult = gapAnalysis.data?.data ?? gapAnalysis.data
          return (
            <div className="gap-summary">
              <div className="gap-stats">
                <div>Covered: <strong>{gapResult.skillsCovered}</strong></div>
                <div>To learn: <strong>{gapResult.missingSkills?.length || 0}</strong></div>
                <div>Total: <strong>{gapResult.totalSkillsRequired}</strong></div>
              </div>

              {(gapResult.missingSkills || []).length > 0 && (
                <div className="gap-missing">
                  <div className="gap-missing-title">Skills to develop</div>
                  <div className="gap-missing-pills">
                    {gapResult.missingSkills.map((s, idx) => (
                      <div
                        key={`${s.name}-${idx}`}
                        className="gap-missing-pill"
                      >
                        {s.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
