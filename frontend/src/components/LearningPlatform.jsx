import { useState } from 'react'
import './LearningPlatform.css'

export default function LearningPlatform({ userId, token, missingSkills, onClose }) {
  const [learningPath, setLearningPath] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expandedSkill, setExpandedSkill] = useState(null)
  const [expandedStage, setExpandedStage] = useState(null)

  const handleGeneratePath = async () => {
    if (!missingSkills || missingSkills.length === 0) {
      alert('No missing skills to learn')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/learning/${userId}/paths`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ missingSkills }),
      })
      const data = await response.json()
      setLearningPath(data)
    } catch (err) {
      console.error(err)
      alert('Error generating learning path')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="learning-platform">
      <div className="learning-header">
        <div>
          <h3>📚 Skill-to-Job Learning Platform</h3>
          <p className="subtitle">Create your personalized learning roadmap</p>
        </div>
        {onClose && (
          <button className="btn-close" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      {!learningPath ? (
        <div className="learning-intro">
          <div className="missing-skills-summary">
            <div className="summary-stat">
              <div className="stat-icon">🎯</div>
              <div>
                <strong>{missingSkills?.length || 0}</strong>
                <p>Skills to learn</p>
              </div>
            </div>
          </div>

          <button onClick={handleGeneratePath} disabled={loading} className="btn-generate">
            {loading ? 'Generating Path...' : 'Generate Learning Path'}
          </button>
        </div>
      ) : (
        <div className="learning-result">
          <div className="path-overview">
            <div className="overview-card">
              <div className="overview-icon">🚀</div>
              <div className="overview-content">
                <h4>Total Timeline</h4>
                <p className="overview-value">{learningPath.totalWeeks} weeks</p>
              </div>
            </div>

            <div className="overview-card">
              <div className="overview-icon">📋</div>
              <div className="overview-content">
                <h4>Total Skills</h4>
                <p className="overview-value">{learningPath.totalSkills}</p>
              </div>
            </div>

            <div className="overview-card">
              <div className="overview-icon">🔴</div>
              <div className="overview-content">
                <h4>Critical</h4>
                <p className="overview-value">{learningPath.summary.critical}</p>
              </div>
            </div>

            <div className="overview-card">
              <div className="overview-icon">🟡</div>
              <div className="overview-content">
                <h4>High Priority</h4>
                <p className="overview-value">{learningPath.summary.high}</p>
              </div>
            </div>
          </div>

          <div className="ordered-path">
            {learningPath.learningPath.map((skillPath, skillIndex) => (
              <SkillPathCard
                key={skillIndex}
                skillPath={skillPath}
                index={skillIndex + 1}
                isExpanded={expandedSkill === skillIndex}
                onToggle={() =>
                  setExpandedSkill(expandedSkill === skillIndex ? null : skillIndex)
                }
                expandedStage={expandedStage}
                onExpandStage={(stageIndex) =>
                  setExpandedStage(
                    expandedStage === `${skillIndex}-${stageIndex}`
                      ? null
                      : `${skillIndex}-${stageIndex}`
                  )
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SkillPathCard({
  skillPath,
  index,
  isExpanded,
  onToggle,
  expandedStage,
  onExpandStage,
}) {
  const importanceIcon = {
    critical: '🔴',
    high: '🟡',
    medium: '🟢',
    low: '⚪',
  }

  const difficultyColor = {
    easy: '#27ae60',
    medium: '#f39c12',
    hard: '#e74c3c',
  }

  return (
    <div className="skill-path-card">
      <div
        className={`skill-path-header ${isExpanded ? 'expanded' : ''}`}
        onClick={onToggle}
      >
        <div className="path-title">
          <span className="path-number">{index}</span>
          <div className="title-text">
            <strong>{skillPath.skill}</strong>
            <div className="path-badges">
              <span className="importance">
                {importanceIcon[skillPath.importance]} {skillPath.importance}
              </span>
              <span className="difficulty" style={{ color: difficultyColor[skillPath.difficulty] }}>
                {skillPath.difficulty}
              </span>
              <span className="timeline">⏱️ {skillPath.totalWeeks} weeks</span>
            </div>
          </div>
        </div>
        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
      </div>

      {isExpanded && (
        <div className="skill-path-content">
          {skillPath.path.map((stage, stageIndex) => (
            <StageCard
              key={stageIndex}
              stage={stage}
              stageIndex={stageIndex}
              skillIndex={index - 1}
              isExpanded={expandedStage === `${index - 1}-${stageIndex}`}
              onToggle={() => onExpandStage(stageIndex)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StageCard({ stage, stageIndex, skillIndex, isExpanded, onToggle }) {
  return (
    <div className="stage-card">
      <div className="stage-header" onClick={onToggle}>
        <div className="stage-title">
          <span className="stage-level">{stage.level}</span>
          <span className="stage-weeks">{stage.weeks} weeks</span>
        </div>
        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
      </div>

      {isExpanded && (
        <div className="stage-content">
          <div className="concepts-section">
            <h5>📖 Core Concepts</h5>
            <ul className="concepts-list">
              {stage.concepts.map((concept, i) => (
                <li key={i}>{concept}</li>
              ))}
            </ul>
          </div>

          {stage.miniProjects && stage.miniProjects.length > 0 && (
            <div className="projects-section">
              <h5>🛠️ Mini-Projects</h5>
              <div className="projects-list">
                {stage.miniProjects.map((project, i) => (
                  <ProjectCard key={i} project={project} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project }) {
  return (
    <div className="project-card">
      <div className="project-header">
        <h6>{project.title}</h6>
        <span className="project-duration">⏱️ {project.duration}</span>
      </div>
      <p className="project-description">{project.description}</p>
      <div className="project-meta">
        <div className="skills-involved">
          <strong>Skills:</strong>
          <div className="skills-tags">
            {project.skills.map((skill, i) => (
              <span key={i} className="skill-tag">
                {skill}
              </span>
            ))}
          </div>
        </div>
        <div className="deliverable">
          <strong>Deliverable:</strong>
          <p>{project.deliverable}</p>
        </div>
      </div>
    </div>
  )
}
