import { useState, useEffect } from 'react'
import './AcademicsSection.css'

export default function AcademicsSection({ userId, token }) {
  const [subjects, setSubjects] = useState([])
  const [attendance, setAttendance] = useState(0)
  const [careerGoal, setCareerGoal] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [newScore, setNewScore] = useState('')
  const [newAttendance, setNewAttendance] = useState('')
  const [newGoal, setNewGoal] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAcademics()
  }, [userId])

  const fetchAcademics = async () => {
    try {
      const response = await fetch(`/api/academics/${userId}/academics`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      setSubjects(data.subjects || [])
      setAttendance(data.attendance || 0)
      setCareerGoal(data.careerGoal || '')
      setLoading(false)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const handleAddSubject = async (e) => {
    e.preventDefault()
    if (!newSubject || !newScore) return

    try {
      const response = await fetch(`/api/academics/${userId}/academics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: newSubject,
          score: newScore,
        }),
      })
      const data = await response.json()
      setSubjects(data.subjects)
      setNewSubject('')
      setNewScore('')
    } catch (err) {
      console.error(err)
    }
  }

  const handleUpdateAttendance = async (e) => {
    e.preventDefault()
    if (newAttendance === '') return

    try {
      const response = await fetch(`/api/academics/${userId}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          attendance: parseInt(newAttendance),
        }),
      })
      const data = await response.json()
      setAttendance(data.attendance)
      setNewAttendance('')
    } catch (err) {
      console.error(err)
    }
  }

  const handleSetCareerGoal = async (e) => {
    e.preventDefault()
    if (!newGoal) return

    try {
      const response = await fetch(`/api/academics/${userId}/career-goal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          goal: newGoal,
        }),
      })
      const data = await response.json()
      setCareerGoal(data.careerGoal)
      setNewGoal('')
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) return <div>Loading...</div>

  return (
    <div className="academics-section">
      <h3>📚 Academics</h3>

      <div className="academics-grid">
        <div className="card">
          <h4>Subjects & Scores</h4>
          <form onSubmit={handleAddSubject}>
            <input
              type="text"
              placeholder="Subject name"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
            />
            <input
              type="number"
              placeholder="Score (0-100)"
              value={newScore}
              onChange={(e) => setNewScore(e.target.value)}
              max="100"
              min="0"
            />
            <button type="submit">Add Subject</button>
          </form>
          <div className="subjects-list">
            {subjects.length === 0 ? (
              <p className="empty">No subjects added yet</p>
            ) : (
              subjects.map((s, i) => (
                <div key={i} className="subject-item">
                  <strong>{s.subject}</strong>
                  <span>{s.score}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <h4>Attendance</h4>
          <div className="attendance-display">{attendance}%</div>
          <form onSubmit={handleUpdateAttendance}>
            <input
              type="number"
              placeholder="Enter attendance %"
              value={newAttendance}
              onChange={(e) => setNewAttendance(e.target.value)}
              max="100"
              min="0"
            />
            <button type="submit">Update</button>
          </form>
        </div>

        <div className="card">
          <h4>Career Goal</h4>
          {careerGoal && <p className="goal-display">{careerGoal}</p>}
          <form onSubmit={handleSetCareerGoal}>
            <input
              type="text"
              placeholder="e.g., Software Engineer, Data Scientist"
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
            />
            <button type="submit">Set Goal</button>
          </form>
        </div>
      </div>
    </div>
  )
}
