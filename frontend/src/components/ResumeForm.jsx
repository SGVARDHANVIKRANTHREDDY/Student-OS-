import { useState, useEffect } from 'react'
import './ResumeForm.css'

export default function ResumeForm({ userId, token, onSave }) {
  const [summary, setSummary] = useState('')
  const [education, setEducation] = useState([])
  const [skills, setSkills] = useState([])
  const [experience, setExperience] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  // Education form state
  const [eduForm, setEduForm] = useState({ school: '', degree: '', year: '' })
  // Skills form state
  const [skillInput, setSkillInput] = useState('')
  // Experience form state
  const [expForm, setExpForm] = useState({ company: '', position: '', duration: '' })
  // Projects form state
  const [projForm, setProjForm] = useState({ title: '', description: '' })

  useEffect(() => {
    fetchResume()
  }, [userId])

  const fetchResume = async () => {
    try {
      const response = await fetch(`/api/resume/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      setSummary(data.summary || '')
      setEducation(data.education || [])
      setSkills(data.skills || [])
      setExperience(data.experience || [])
      setProjects(data.projects || [])
      setLoading(false)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const saveResume = async () => {
    try {
      const response = await fetch(`/api/resume/${userId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          summary,
          education,
          skills,
          experience,
          projects,
        }),
      })
      await response.json()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      if (onSave) onSave()
    } catch (err) {
      console.error(err)
    }
  }

  const addEducation = () => {
    if (!eduForm.school || !eduForm.degree) return
    setEducation([...education, eduForm])
    setEduForm({ school: '', degree: '', year: '' })
  }

  const removeEducation = (index) => {
    setEducation(education.filter((_, i) => i !== index))
  }

  const addSkill = () => {
    if (!skillInput) return
    setSkills([...skills, skillInput])
    setSkillInput('')
  }

  const removeSkill = (index) => {
    setSkills(skills.filter((_, i) => i !== index))
  }

  const addExperience = () => {
    if (!expForm.company || !expForm.position) return
    setExperience([...experience, expForm])
    setExpForm({ company: '', position: '', duration: '' })
  }

  const removeExperience = (index) => {
    setExperience(experience.filter((_, i) => i !== index))
  }

  const addProject = () => {
    if (!projForm.title || !projForm.description) return
    setProjects([...projects, projForm])
    setProjForm({ title: '', description: '' })
  }

  const removeProject = (index) => {
    setProjects(projects.filter((_, i) => i !== index))
  }

  if (loading) return <div>Loading...</div>

  return (
    <div className="resume-form">
      <div className="form-section">
        <h4>Professional Summary</h4>
        <textarea
          placeholder="Write a brief summary about yourself (50+ characters recommended)"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows="4"
        />
      </div>

      <div className="form-section">
        <h4>Education</h4>
        <div className="form-inputs">
          <input
            type="text"
            placeholder="School/University"
            value={eduForm.school}
            onChange={(e) => setEduForm({ ...eduForm, school: e.target.value })}
          />
          <input
            type="text"
            placeholder="Degree (e.g., B.Tech, Bachelor of Science)"
            value={eduForm.degree}
            onChange={(e) => setEduForm({ ...eduForm, degree: e.target.value })}
          />
          <input
            type="text"
            placeholder="Year (e.g., 2024)"
            value={eduForm.year}
            onChange={(e) => setEduForm({ ...eduForm, year: e.target.value })}
          />
          <button onClick={addEducation} className="btn-add">
            + Add Education
          </button>
        </div>
        <div className="items-list">
          {education.map((edu, i) => (
            <div key={i} className="item">
              <div>
                <strong>{edu.school}</strong>
                <p>{edu.degree}</p>
                {edu.year && <p className="year">{edu.year}</p>}
              </div>
              <button onClick={() => removeEducation(i)} className="btn-remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="form-section">
        <h4>Skills</h4>
        <div className="skill-input">
          <input
            type="text"
            placeholder="Enter a skill (e.g., React, Python, Leadership)"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addSkill()}
          />
          <button onClick={addSkill} className="btn-add">
            + Add Skill
          </button>
        </div>
        <div className="skills-list">
          {skills.map((skill, i) => (
            <div key={i} className="skill-tag">
              {skill}
              <button onClick={() => removeSkill(i)}>✕</button>
            </div>
          ))}
        </div>
        {skills.length === 0 && <p className="empty-hint">Add skills to improve your score</p>}
      </div>

      <div className="form-section">
        <h4>Professional Experience</h4>
        <div className="form-inputs">
          <input
            type="text"
            placeholder="Company"
            value={expForm.company}
            onChange={(e) => setExpForm({ ...expForm, company: e.target.value })}
          />
          <input
            type="text"
            placeholder="Position"
            value={expForm.position}
            onChange={(e) => setExpForm({ ...expForm, position: e.target.value })}
          />
          <input
            type="text"
            placeholder="Duration (e.g., 2 years)"
            value={expForm.duration}
            onChange={(e) => setExpForm({ ...expForm, duration: e.target.value })}
          />
          <button onClick={addExperience} className="btn-add">
            + Add Experience
          </button>
        </div>
        <div className="items-list">
          {experience.map((exp, i) => (
            <div key={i} className="item">
              <div>
                <strong>{exp.position}</strong>
                <p>{exp.company}</p>
                {exp.duration && <p className="year">{exp.duration}</p>}
              </div>
              <button onClick={() => removeExperience(i)} className="btn-remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="form-section">
        <h4>Projects</h4>
        <div className="form-inputs">
          <input
            type="text"
            placeholder="Project title"
            value={projForm.title}
            onChange={(e) => setProjForm({ ...projForm, title: e.target.value })}
          />
          <textarea
            placeholder="Project description"
            value={projForm.description}
            onChange={(e) => setProjForm({ ...projForm, description: e.target.value })}
            rows="2"
          />
          <button onClick={addProject} className="btn-add">
            + Add Project
          </button>
        </div>
        <div className="items-list">
          {projects.map((proj, i) => (
            <div key={i} className="item">
              <div>
                <strong>{proj.title}</strong>
                <p>{proj.description}</p>
              </div>
              <button onClick={() => removeProject(i)} className="btn-remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="form-actions">
        <button onClick={saveResume} className="btn-save">
          {saved ? '✓ Saved' : 'Save Resume'}
        </button>
      </div>
    </div>
  )
}
