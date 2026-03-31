import ResumeForm from '../components/ResumeForm'
import ResumePreview from '../components/ResumePreview'
import ResumeAnalysis from '../components/ResumeAnalysis'
import { useAuth } from '../context/AuthContext'
import { useResume } from '../hooks/useApi'
import './Resume.css'

export default function Resume() {
  const { user, token } = useAuth()
  const { data: resumeRes, refetch } = useResume(user?.id)
  const resume = resumeRes?.data ?? resumeRes ?? { summary: '', education: [], skills: [], projects: [], experience: [] }

  return (
    <div className="resume-page">
      <h2>Resume Builder</h2>
      <p className="subtitle">Build an ATS-friendly resume with intelligent recommendations</p>
      
      <div className="resume-grid">
        <div>
          <ResumeForm userId={user.id} token={token} onSave={refetch} />
        </div>
        <div>
          <ResumePreview resume={resume} />
        </div>
      </div>

      <ResumeAnalysis userId={user.id} token={token} refreshTrigger={0} />
    </div>
  )
}
