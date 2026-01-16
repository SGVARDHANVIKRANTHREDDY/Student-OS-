import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import './Onboarding.css'

export default function Onboarding() {
  const navigate = useNavigate()
  const { token, updateProfile } = useAuth()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [college, setCollege] = useState('')
  const [branch, setBranch] = useState('')
  const [graduationYear, setGraduationYear] = useState('')
  const [careerGoal, setCareerGoal] = useState('')
  const [step, setStep] = useState(1)

  useEffect(() => {
    const load = async () => {
      if (!token) return
      const res = await apiFetch('/api/profile/me', { token })
      if (res.ok && res.data?.profile) {
        setCollege(res.data.profile.college || '')
        setBranch(res.data.profile.branch || '')
        setGraduationYear(res.data.profile.graduationYear || '')
        setCareerGoal(res.data.profile.careerGoal || '')
        if (res.data.profile.onboarded) navigate('/app')
      }
    }

    load()
  }, [navigate, token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (step === 1) {
      setStep(2)
      return
    }

    setLoading(true)

    const res = await apiFetch('/api/profile/me', {
      token,
      method: 'POST',
      body: { college, branch, graduationYear, careerGoal, onboarded: true },
    })

    setLoading(false)

    if (!res.ok) {
      setError(res.data?.message || 'Failed to save onboarding')
      return
    }

    if (res.data?.profile) updateProfile(res.data.profile)
    navigate('/app')
  }

  return (
    <div className="onboarding">
      <div className="card">
        <h1>Complete your profile</h1>
        <p className="sub">Step {step} of 2 — used to personalize your roadmap and dashboard.</p>

        <form onSubmit={handleSubmit}>
          {step === 1 ? (
            <div className="grid">
              <div>
                <label>College</label>
                <input value={college} onChange={(e) => setCollege(e.target.value)} placeholder="e.g., ABC Institute" />
              </div>
              <div>
                <label>Branch</label>
                <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="e.g., CSE, ECE" />
              </div>
              <div>
                <label>Graduation year</label>
                <input
                  value={graduationYear}
                  onChange={(e) => setGraduationYear(e.target.value)}
                  placeholder="e.g., 2027"
                  inputMode="numeric"
                />
              </div>
              <div>
                <label>Primary outcome</label>
                <input
                  value={careerGoal}
                  onChange={(e) => setCareerGoal(e.target.value)}
                  placeholder="e.g., SDE Intern, Data Analyst, Frontend Developer"
                />
              </div>
            </div>
          ) : (
            <div className="grid">
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Career goal</label>
                <input
                  value={careerGoal}
                  onChange={(e) => setCareerGoal(e.target.value)}
                  placeholder="e.g., SDE Intern, Data Analyst, Frontend Developer"
                  required
                />
              </div>
              <div>
                <label>College</label>
                <input value={college} onChange={(e) => setCollege(e.target.value)} placeholder="e.g., ABC Institute" />
              </div>
              <div>
                <label>Branch</label>
                <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="e.g., CSE, ECE" />
              </div>
            </div>
          )}

          {error && <div className="error">{error}</div>}

          <div className="actions">
            {step === 2 ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep(1)}
                disabled={loading}
              >
                Back
              </button>
            ) : (
              <div />
            )}

            <button className="btn" type="submit" disabled={loading}>
              {loading ? 'Saving…' : step === 1 ? 'Continue' : 'Finish setup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
