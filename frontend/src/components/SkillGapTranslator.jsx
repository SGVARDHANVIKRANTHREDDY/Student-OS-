import { useState } from 'react'
import './SkillGapTranslator.css'

export default function SkillGapTranslator({ userId, token, jobDescription, roleId, resumeSkills, onAnalyze }) {
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [showRoadmaps, setShowRoadmaps] = useState(false)

  const handleAnalyze = async () => {
    if (!jobDescription && !roleId) {
      alert('Please provide job description or role')
      return
    }

    setAnalyzing(true)
    try {
      const response = await fetch(`/api/skills/${userId}/skill-gaps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobDescription: jobDescription || '',
          roleId: roleId || '',
          resumeSkills: resumeSkills || [],
        }),
      })
      const data = await response.json()
      setResult(data)
      if (onAnalyze && data.missingSkills) {
        onAnalyze(data.missingSkills)
      }
    } catch (err) {
      console.error(err)
      alert('Error analyzing skills')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="skill-gap-translator">
      <h3>🎯 Skill Gap Translator</h3>
      <p className="subtitle">Identify what you need to learn for your target role</p>

      <button onClick={handleAnalyze} disabled={analyzing} className="btn-analyze">
        {analyzing ? 'Analyzing...' : 'Analyze Skill Gaps'}
      </button>

      {result && (
        <div className="gap-result">
          <div className="gap-header">
            <div className="gap-stats">
              <div className="stat-box">
                <div className="stat-number">{result.skillsCovered}</div>
                <div className="stat-label">Covered</div>
              </div>
              <div className="stat-box">
                <div className="stat-number">{result.missingSkills.length}</div>
                <div className="stat-label">To Learn</div>
              </div>
              <div className="stat-box">
                <div className="stat-number">{result.totalSkillsRequired}</div>
                <div className="stat-label">Total Required</div>
              </div>
            </div>
          </div>

          {result.mustHaves && result.mustHaves.length > 0 && (
            <div className="skill-section">
              <h4>🔴 Must-Have Skills</h4>
              <p className="section-desc">Critical for this role</p>
              <div className="skills-grid">
                {result.mustHaves.map((skill, i) => (
                  <SkillCard key={i} skill={skill} showRoadmap={showRoadmaps} />
                ))}
              </div>
            </div>
          )}

          {result.goodToHaves && result.goodToHaves.length > 0 && (
            <div className="skill-section">
              <h4>🟡 Good-to-Have Skills</h4>
              <p className="section-desc">Nice to have, increases competitiveness</p>
              <div className="skills-grid">
                {result.goodToHaves.map((skill, i) => (
                  <SkillCard key={i} skill={skill} showRoadmap={showRoadmaps} />
                ))}
              </div>
            </div>
          )}

          {result.missingSkills && result.missingSkills.length > 0 && (
            <div className="skill-section missing-section">
              <div className="missing-header">
                <h4>📚 Your Learning Roadmap</h4>
                <button
                  className={`btn-toggle-roadmaps ${showRoadmaps ? 'active' : ''}`}
                  onClick={() => setShowRoadmaps(!showRoadmaps)}
                >
                  {showRoadmaps ? 'Hide' : 'Show'} Learning Paths
                </button>
              </div>
              <p className="section-desc">
                Priority order based on importance and difficulty
              </p>
              <div className="missing-skills-list">
                {result.missingSkills.map((skill, i) => (
                  <MissingSkillCard key={i} skill={skill} index={i + 1} showRoadmap={showRoadmaps} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SkillCard({ skill, showRoadmap }) {
  const difficultyColor = {
    easy: '#27ae60',
    medium: '#f39c12',
    hard: '#e74c3c',
  }

  const categoryEmoji = {
    frontend: '🎨',
    backend: '⚙️',
    database: '🗄️',
    devops: '🚀',
    tools: '🔧',
    data: '📊',
    soft: '💬',
    other: '📌',
  }

  return (
    <div className="skill-card">
      <div className="skill-header">
        <span className="category-emoji">{categoryEmoji[skill.category] || '📌'}</span>
        <strong>{skill.name}</strong>
      </div>
      <div className="skill-meta">
        <span className="difficulty" style={{ color: difficultyColor[skill.difficulty] }}>
          {skill.difficulty}
        </span>
        <span className="category">{skill.category}</span>
      </div>
    </div>
  )
}

function MissingSkillCard({ skill, index, showRoadmap }) {
  const difficultyColor = {
    easy: '#27ae60',
    medium: '#f39c12',
    hard: '#e74c3c',
  }

  const importanceIcon = {
    critical: '🔴',
    high: '🟡',
    medium: '🟢',
    low: '⚪',
  }

  return (
    <div className="missing-skill-card">
      <div className="missing-skill-header">
        <span className="priority-badge">{index}</span>
        <div className="skill-info">
          <strong>{skill.name}</strong>
          <div className="skill-attributes">
            <span className="importance">{importanceIcon[skill.importance]} {skill.importance}</span>
            <span className="difficulty" style={{ color: difficultyColor[skill.difficulty] }}>
              {skill.difficulty}
            </span>
          </div>
        </div>
      </div>

      {showRoadmap && skill.roadmap && (
        <div className="roadmap">
          <div className="roadmap-duration">⏱️ {skill.roadmap.duration}</div>
          <div className="roadmap-path">
            {skill.roadmap.path.map((step, i) => (
              <div key={i} className="roadmap-step">
                <span className="step-number">{i + 1}</span>
                <span className="step-text">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
