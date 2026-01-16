import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import './Roadmaps.css'

export default function Roadmaps() {
  const { token } = useAuth()

  const [companies, setCompanies] = useState([])
  const [roles, setRoles] = useState([])

  const [selectedCompany, setSelectedCompany] = useState('amazon')
  const [selectedRole, setSelectedRole] = useState('sde-intern')

  const [loading, setLoading] = useState(false)
  const [roadmap, setRoadmap] = useState(null)
  const [error, setError] = useState('')

  const canFetch = useMemo(() => !!selectedCompany && !!selectedRole, [selectedCompany, selectedRole])

  useEffect(() => {
    const loadLists = async () => {
      try {
        const [companiesRes, rolesRes] = await Promise.all([
          fetch('/api/roadmaps/companies', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/roadmaps/roles', { headers: { Authorization: `Bearer ${token}` } }),
        ])

        const companiesJson = await companiesRes.json()
        const rolesJson = await rolesRes.json()

        setCompanies(Array.isArray(companiesJson) ? companiesJson : [])
        setRoles(Array.isArray(rolesJson) ? rolesJson : [])
      } catch (e) {
        console.error(e)
      }
    }

    loadLists()
  }, [token])

  useEffect(() => {
    if (!canFetch) return

    const fetchRoadmap = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/roadmaps/${selectedCompany}/${selectedRole}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (!res.ok) {
          setRoadmap(null)
          setError(data?.message || 'Failed to load roadmap')
          return
        }
        setRoadmap(data)
      } catch (e) {
        console.error(e)
        setRoadmap(null)
        setError('Failed to load roadmap')
      } finally {
        setLoading(false)
      }
    }

    fetchRoadmap()
  }, [canFetch, selectedCompany, selectedRole, token])

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

      {loading && <div className="loading">Loading roadmap…</div>}
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
