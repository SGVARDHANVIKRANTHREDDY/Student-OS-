import { useState, useEffect } from 'react'
import ResumeForm from '../components/ResumeForm'
import ResumePreview from '../components/ResumePreview'
import ResumeAnalysis from '../components/ResumeAnalysis'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

export default function Resume() {
  const { user, token } = useAuth()
  const [resume, setResume] = useState({ summary: '', education: [], skills: [], projects: [], experience: [] })
  const [refreshAnalysis, setRefreshAnalysis] = useState(0)

  const handleSave = async () => {
    if (!user?.id || !token) return
    const res = await apiFetch(`/api/resume/${user.id}`, { token })
    if (res.ok) {
      setResume(res.data)
      setRefreshAnalysis((prev) => prev + 1)
    }
  }

  useEffect(() => {
    handleSave()
  }, [user?.id, token])

  return (
    <div style={{ padding: '30px' }}>
      <h2>Resume Builder</h2>
      <p style={{ color: '#999' }}>Build an ATS-friendly resume with intelligent recommendations</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '30px' }}>
        <div>
          <ResumeForm userId={user.id} token={token} onSave={handleSave} />
        </div>
        <div>
          <ResumePreview resume={resume} />
        </div>
      </div>

      <ResumeAnalysis userId={user.id} token={token} refreshTrigger={refreshAnalysis} />
    </div>
  )
}
