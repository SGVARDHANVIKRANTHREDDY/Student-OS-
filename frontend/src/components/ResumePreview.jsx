import './ResumePreview.css'

export default function ResumePreview({ resume }) {
  if (!resume) {
    return <div className="resume-preview-empty">No resume data. Fill the form to preview.</div>
  }

  return (
    <div className="resume-preview">
      <div className="resume-header">
        <h2 style={{ margin: '0 0 5px 0', fontSize: '24px' }}>Resume Preview (ATS-Friendly)</h2>
        <p style={{ margin: 0, color: '#999', fontSize: '12px' }}>
          This preview shows how your resume appears to Applicant Tracking Systems
        </p>
      </div>

      {resume.summary && (
        <section className="preview-section">
          <h3>PROFESSIONAL SUMMARY</h3>
          <p>{resume.summary}</p>
        </section>
      )}

      {resume.experience && resume.experience.length > 0 && (
        <section className="preview-section">
          <h3>PROFESSIONAL EXPERIENCE</h3>
          {resume.experience.map((exp, i) => (
            <div key={i} className="preview-item">
              <div className="preview-item-header">
                <strong>{exp.position}</strong>
                <span className="preview-item-meta">{exp.duration}</span>
              </div>
              <div className="preview-item-company">{exp.company}</div>
            </div>
          ))}
        </section>
      )}

      {resume.education && resume.education.length > 0 && (
        <section className="preview-section">
          <h3>EDUCATION</h3>
          {resume.education.map((edu, i) => (
            <div key={i} className="preview-item">
              <div className="preview-item-header">
                <strong>{edu.school}</strong>
                <span className="preview-item-meta">{edu.year}</span>
              </div>
              <div className="preview-item-company">{edu.degree}</div>
            </div>
          ))}
        </section>
      )}

      {resume.skills && resume.skills.length > 0 && (
        <section className="preview-section">
          <h3>SKILLS</h3>
          <div className="preview-skills">
            {resume.skills.join(' • ')}
          </div>
        </section>
      )}

      {resume.projects && resume.projects.length > 0 && (
        <section className="preview-section">
          <h3>PROJECTS</h3>
          {resume.projects.map((proj, i) => (
            <div key={i} className="preview-item">
              <strong>{proj.title}</strong>
              <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '13px' }}>
                {proj.description}
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
