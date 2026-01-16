import { useState, useEffect } from 'react'
import './TasksSection.css'

export default function TasksSection({ userId, token }) {
  const [assignments, setAssignments] = useState([])
  const [exams, setExams] = useState([])
  const [newTitle, setNewTitle] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newExamSubject, setNewExamSubject] = useState('')
  const [newExamDate, setNewExamDate] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTasks()
  }, [userId])

  const fetchTasks = async () => {
    try {
      const [assignRes, examRes] = await Promise.all([
        fetch(`/api/tasks/${userId}/assignments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/tasks/${userId}/exams`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      const assignData = await assignRes.json()
      const examData = await examRes.json()
      setAssignments(assignData)
      setExams(examData)
      setLoading(false)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const handleAddAssignment = async (e) => {
    e.preventDefault()
    if (!newTitle || !newDueDate) return

    try {
      const response = await fetch(`/api/tasks/${userId}/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newTitle,
          dueDate: newDueDate,
          status: 'pending',
        }),
      })
      const data = await response.json()
      setAssignments([...assignments, data])
      setNewTitle('')
      setNewDueDate('')
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteAssignment = async (id) => {
    try {
      await fetch(`/api/tasks/${userId}/assignments/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setAssignments(assignments.filter((a) => a.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  const handleUpdateAssignment = async (id, status) => {
    try {
      const response = await fetch(`/api/tasks/${userId}/assignments/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      })
      const data = await response.json()
      setAssignments(assignments.map((a) => (a.id === id ? data : a)))
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddExam = async (e) => {
    e.preventDefault()
    if (!newExamSubject || !newExamDate) return

    try {
      const response = await fetch(`/api/tasks/${userId}/exams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: newExamSubject,
          date: newExamDate,
        }),
      })
      const data = await response.json()
      setExams([...exams, data])
      setNewExamSubject('')
      setNewExamDate('')
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteExam = async (id) => {
    try {
      await fetch(`/api/tasks/${userId}/exams/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setExams(exams.filter((e) => e.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) return <div>Loading...</div>

  return (
    <div className="tasks-section">
      <h3>📋 Assignments & Exams</h3>

      <div className="tasks-grid">
        <div className="card">
          <h4>Assignments</h4>
          <form onSubmit={handleAddAssignment}>
            <input
              type="text"
              placeholder="Assignment title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
            />
            <button type="submit">Add Assignment</button>
          </form>
          <div className="tasks-list">
            {assignments.length === 0 ? (
              <p className="empty">No assignments yet</p>
            ) : (
              assignments.map((a) => (
                <div key={a.id} className="task-item">
                  <div>
                    <strong>{a.title}</strong>
                    <p className="date">{new Date(a.dueDate).toLocaleDateString()}</p>
                  </div>
                  <div className="actions">
                    <select
                      value={a.status}
                      onChange={(e) => handleUpdateAssignment(a.id, e.target.value)}
                    >
                      <option value="pending">Pending</option>
                      <option value="completed">Completed</option>
                    </select>
                    <button onClick={() => handleDeleteAssignment(a.id)}>✕</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <h4>Exams</h4>
          <form onSubmit={handleAddExam}>
            <input
              type="text"
              placeholder="Subject"
              value={newExamSubject}
              onChange={(e) => setNewExamSubject(e.target.value)}
            />
            <input
              type="date"
              value={newExamDate}
              onChange={(e) => setNewExamDate(e.target.value)}
            />
            <button type="submit">Add Exam</button>
          </form>
          <div className="tasks-list">
            {exams.length === 0 ? (
              <p className="empty">No exams scheduled</p>
            ) : (
              exams.map((e) => (
                <div key={e.id} className="exam-item">
                  <div>
                    <strong>{e.subject}</strong>
                    <p className="date">{new Date(e.date).toLocaleDateString()}</p>
                  </div>
                  <button onClick={() => handleDeleteExam(e.id)}>✕</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
