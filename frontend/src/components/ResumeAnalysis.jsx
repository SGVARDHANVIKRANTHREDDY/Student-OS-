import { useState, useEffect } from 'react'

export default function ResumeAnalysis({ userId, token, refreshTrigger }) {
  const [analysis, setAnalysis] = useState(null)

  useEffect(() => {
    if (!userId || !token) return
    
    const analyzeResume = async () => {
      try {
        const response = await fetch(`/api/resume/${userId}/analyze`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.ok) {
          const data = await response.json()
          setAnalysis(data)
        }
      } catch (err) {
        console.error('Analysis error:', err)
      }
    }

    analyzeResume()
  }, [userId, token, refreshTrigger])

  if (!analysis) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>Loading analysis...</div>
  }

  return (
    <div style={{ background: 'white', padding: '25px', borderRadius: '8px', marginTop: '30px' }}>
      <h3>📊 Resume Intelligence</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#667eea' }}>{analysis.qualityScore}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>Quality Score</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#667eea' }}>{analysis.atsScore}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>ATS Score</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#555' }}>
            {analysis.skillsCovered} / {analysis.totalCommonSkills}
          </div>
          <div style={{ fontSize: '12px', color: '#999' }}>Skills Covered</div>
        </div>
      </div>

      {analysis.missingSkills && analysis.missingSkills.length > 0 && (
        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #eee' }}>
          <h4 style={{ margin: '0 0 12px 0' }}>Suggested Skills</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {analysis.missingSkills.map((skill, i) => (
              <div key={i} style={{ padding: '6px 12px', background: '#f0f7ff', border: '1px solid #667eea', borderRadius: '16px', fontSize: '12px', color: '#667eea' }}>
                {skill}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
