import { useState, useEffect } from 'react'
import './JobMatcher.css'

export default function JobMatcher({ userId, token, resume, onTargetChange }) {
  const [jobRoles, setJobRoles] = useState([])
  const [selectedRole, setSelectedRole] = useState('')
  const [customJobDesc, setCustomJobDesc] = useState('')
  const [matching, setMatching] = useState(false)
  const [result, setResult] = useState(null)
  const [matchTab, setMatchTab] = useState('role') // 'role' or 'custom'

  useEffect(() => {
    fetchJobRoles()
  }, [])

  useEffect(() => {
    if (!onTargetChange) return

    if (matchTab === 'role') {
      onTargetChange({ roleId: selectedRole || '', jobDescription: '' })
      return
    }

    onTargetChange({ roleId: '', jobDescription: customJobDesc || '' })
  }, [matchTab, selectedRole, customJobDesc, onTargetChange])

  const fetchJobRoles = async () => {
    try {
      const response = await fetch(`/api/matching/roles/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      setJobRoles(data)
    } catch (err) {
      console.error(err)
    }
  }

  const handleMatch = async () => {
    if (matchTab === 'role' && !selectedRole) {
      alert('Please select a role')
      return
    }
    if (matchTab === 'custom' && !customJobDesc) {
      alert('Please enter a job description')
      return
    }

    setMatching(true)
    try {
      const response = await fetch(`/api/matching/${userId}/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          roleId: matchTab === 'role' ? selectedRole : null,
          jobDescription: matchTab === 'custom' ? customJobDesc : null,
          resume,
        }),
      })
      const data = await response.json()
      setResult(data)
    } catch (err) {
      console.error(err)
      alert('Error matching resume')
    } finally {
      setMatching(false)
    }
  }

  return (
    <div className="job-matcher">
      <h3>🎯 Job Matching</h3>

      <div className="matcher-tabs">
        <button
          className={`tab ${matchTab === 'role' ? 'active' : ''}`}
          onClick={() => setMatchTab('role')}
        >
          Preset Roles
        </button>
        <button
          className={`tab ${matchTab === 'custom' ? 'active' : ''}`}
          onClick={() => setMatchTab('custom')}
        >
          Custom Job Description
        </button>
      </div>

      <div className="matcher-input">
        {matchTab === 'role' ? (
          <div>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="role-select"
            >
              <option value="">Select a job role...</option>
              {jobRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.title}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <textarea
            placeholder="Paste job description here..."
            value={customJobDesc}
            onChange={(e) => setCustomJobDesc(e.target.value)}
            rows="6"
            className="job-desc-input"
          />
        )}

        <button onClick={handleMatch} disabled={matching} className="btn-match">
          {matching ? 'Analyzing...' : 'Match Resume'}
        </button>
      </div>

      {result && <MatchResult result={result} />}
    </div>
  )
}

function MatchResult({ result }) {
  const getMatchColor = (percentage) => {
    if (percentage >= 80) return '#27ae60'
    if (percentage >= 60) return '#f39c12'
    return '#e74c3c'
  }

  const decisionColor = result.decision === 'APPLY' ? '#27ae60' : '#f39c12'

  return (
    <div className="match-result">
      <div className="result-header">
        <h4>{result.jobTitle}</h4>
        <div className="match-percentage" style={{ color: getMatchColor(result.matchPercentage) }}>
          {result.matchPercentage}% Match
        </div>
      </div>

      <div className="match-scores">
        <div className="score-item">
          <span>Required Skills</span>
          <div className="score-bar">
            <div
              className="score-fill"
              style={{
                width: `${result.requiredMatch}%`,
                background: getMatchColor(result.requiredMatch),
              }}
            />
          </div>
          <span className="score-text">{result.requiredMatch}%</span>
        </div>

        <div className="score-item">
          <span>Preferred Skills</span>
          <div className="score-bar">
            <div
              className="score-fill"
              style={{
                width: `${result.preferredMatch}%`,
                background: getMatchColor(result.preferredMatch),
              }}
            />
          </div>
          <span className="score-text">{result.preferredMatch}%</span>
        </div>
      </div>

      <div className="decision-box" style={{ borderLeft: `4px solid ${decisionColor}` }}>
        <div className="decision-text">
          <strong>{result.decision}</strong>
          <p>{result.reason}</p>
        </div>
        <button className={`btn-action btn-${result.decision.toLowerCase()}`}>
          {result.decision === 'APPLY' ? 'Apply Now' : 'Build Skills'}
        </button>
      </div>

      {result.strengths && result.strengths.length > 0 && (
        <div className="match-section">
          <h5>💪 Your Strengths</h5>
          <div className="skill-list">
            {result.strengths.map((skill, i) => (
              <div key={i} className="skill-badge strength">
                ✓ {skill}
              </div>
            ))}
          </div>
        </div>
      )}

      {result.missingSkills && result.missingSkills.length > 0 && (
        <div className="match-section">
          <h5>📚 Skills to Develop</h5>
          <div className="skill-list">
            {result.missingSkills.map((skill, i) => (
              <div key={i} className="skill-badge missing">
                + {skill}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
