import { useState, useEffect } from 'react'
import './ResumeAnalysis.css'
import { api } from '../lib/apiClient'

export default function ResumeAnalysis({ userId, token, refreshTrigger }) {
  const [analysis, setAnalysis] = useState(null)

  useEffect(() => {
    if (!userId || !token) return
    
    const analyzeResume = async () => {
      try {
        const data = await api.post(`/api/resume/${userId}/analyze`, null, { token })
        setAnalysis(data)
      } catch (err) {
        console.error('Analysis error:', err)
      }
    }

    analyzeResume()
  }, [userId, token, refreshTrigger])

  if (!analysis) {
    return <div className="analysis-loading">Loading analysis...</div>
  }

  return (
    <div className="analysis-container">
      <h3>Resume Intelligence</h3>
      <div className="analysis-scores">
        <div className="analysis-score-card">
          <div className="analysis-score-value">{analysis.qualityScore}</div>
          <div className="analysis-score-label">Quality Score</div>
        </div>
        <div className="analysis-score-card">
          <div className="analysis-score-value">{analysis.atsScore}</div>
          <div className="analysis-score-label">ATS Score</div>
        </div>
        <div className="analysis-score-card">
          <div className="analysis-score-ratio">
            {analysis.skillsCovered} / {analysis.totalCommonSkills}
          </div>
          <div className="analysis-score-label">Skills Covered</div>
        </div>
      </div>

      {analysis.missingSkills && analysis.missingSkills.length > 0 && (
        <div className="analysis-missing">
          <h4>Suggested Skills</h4>
          <div className="analysis-missing-list">
            {analysis.missingSkills.map((skill, i) => (
              <div key={i} className="analysis-missing-pill">{skill}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
