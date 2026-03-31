import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useProfile, useUpdateProfile } from '../hooks/useApi'
import './Onboarding.css'

export default function Onboarding() {
  const navigate = useNavigate()
  const { updateProfile: authUpdateProfile } = useAuth()

  const { data: profileRes } = useProfile()
  const saveProfile = useUpdateProfile()

  const [college, setCollege] = useState('')
  const [branch, setBranch] = useState('')
  const [graduationYear, setGraduationYear] = useState('')
  const [careerGoal, setCareerGoal] = useState('')
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')

  useEffect(() => {
    const profile = profileRes?.data?.profile ?? profileRes?.profile
    if (profile) {
      setCollege(profile.college || '')
      setBranch(profile.branch || '')
      setGraduationYear(profile.graduationYear || '')
      setCareerGoal(profile.careerGoal || '')
      if (profile.onboarded) navigate('/app')
    }
  }, [profileRes, navigate])

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (step === 1) {
      setStep(2)
      return
    }

    saveProfile.mutate(
      { college, branch, graduationYear, careerGoal, onboarded: true },
      {
        onSuccess: (data) => {
          const profile = data?.data?.profile ?? data?.profile
          if (profile) authUpdateProfile(profile)
          navigate('/app')
        },
        onError: (err) => setError(err.message || 'Failed to save onboarding'),
      },
    )
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
              <div className="full-span">
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
                disabled={saveProfile.isPending}
              >
                Back
              </button>
            ) : (
              <div />
            )}

            <button className="btn" type="submit" disabled={saveProfile.isPending}>
              {saveProfile.isPending ? 'Saving…' : step === 1 ? 'Continue' : 'Finish setup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
