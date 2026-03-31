import { useState } from 'react'
import { useRoadmapCompanies, useRoadmapRoles, useRoadmap } from '../hooks/useApi'
import Spinner from '../components/Spinner'
import './Roadmaps.css'

export default function Roadmaps() {
  const [selectedCompany, setSelectedCompany] = useState('amazon')
  const [selectedRole, setSelectedRole] = useState('sde-intern')

  const { data: companiesRes } = useRoadmapCompanies()
  const companies = companiesRes?.data ?? (Array.isArray(companiesRes) ? companiesRes : [])

  const { data: rolesRes } = useRoadmapRoles()
  const roles = rolesRes?.data ?? (Array.isArray(rolesRes) ? rolesRes : [])

  const { data: roadmapRes, isLoading: loading, error: fetchError } = useRoadmap(selectedCompany, selectedRole)
  const roadmap = roadmapRes?.data ?? roadmapRes ?? null
  const error = fetchError ? (fetchError.message || 'Failed to load roadmap') : ''

  return (
    <div className="roadmaps-page">
      <div className="roadmaps-header">
        <div>
          <h2>Placement Roadmaps</h2>
          <p className="subtitle">
            Structured prep paths for Tier-2/Tier-3 students — role + company aligned
          </p>
        </div>
      </div>

      <div className="selector-card">
        <div className="selector-grid">
          <div>
            <label>Company</label>
            <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
              {companies.length === 0 ? (
                <option value="amazon">Amazon</option>
              ) : (
                companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label>Role</label>
            <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
              {roles.length === 0 ? (
                <option value="sde-intern">SDE Intern</option>
              ) : (
                roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="hint">
            <div className="hint-title">What you get</div>
            <div className="hint-text">DSA topics • projects • resume checklist • mock suggestions</div>
          </div>
        </div>
      </div>

      {loading && <Spinner />}
      {error && <div className="error">{error}</div>}

      {roadmap && (
        <div className="roadmap-grid">
          <div className="card">
            <h3>{roadmap.title}</h3>
            {roadmap.companyNotes?.length > 0 && (
              <div className="notes">
                {roadmap.companyNotes.map((n, i) => (
                  <div key={i} className="note">
                    • {n}
                  </div>
                ))}
              </div>
            )}

            <div className="section">
              <h4>Outcomes</h4>
              <div className="chips">
                {(roadmap.outcomes || []).map((x, i) => (
                  <span key={i} className="chip">
                    {x}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <h3>DSA Topics</h3>
            <TopicBlock title="Foundations" items={roadmap.dsaTopics?.foundations || []} />
            <TopicBlock title="Core" items={roadmap.dsaTopics?.core || []} />
            <TopicBlock title="Advanced" items={roadmap.dsaTopics?.advanced || []} />
            {roadmap.dsaTopics?.companyFocus?.length > 0 && (
              <TopicBlock title="Company Focus" items={roadmap.dsaTopics.companyFocus} />
            )}
          </div>

          <div className="card">
            <h3>Projects (Outcome-Oriented)</h3>
            <div className="projects">
              {(roadmap.projects || []).map((p, i) => (
                <div key={i} className="project">
                  <div className="project-title">{p.title}</div>
                  <div className="project-outcome">{p.outcome}</div>
                  {p.scope?.length > 0 && (
                    <ul className="project-scope">
                      {p.scope.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Resume Checklist</h3>
            <ul className="list">
              {(roadmap.resumeChecklist || []).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3>Mock Suggestions (Text-based)</h3>
            <ul className="list">
              {(roadmap.mockSuggestions || []).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function TopicBlock({ title, items }) {
  if (!items || items.length === 0) return null
  return (
    <div className="section">
      <h4>{title}</h4>
      <div className="chips">
        {items.map((x, i) => (
          <span key={i} className="chip">
            {x}
          </span>
        ))}
      </div>
    </div>
  )
}
