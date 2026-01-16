import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { getDb } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { getResumeParsedSnapshot, ensureDataDir } from '../lib/resumeDomain.js'
import { toPublicError } from '../lib/publicErrors.js'

function nowIso() {
  return new Date().toISOString()
}

function baseDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function updateRenderStatus(db, renderId, { status, outputPdfPath = null, errorText = null }) {
  const now = nowIso()
  db.prepare(
    `UPDATE resume_renders
     SET status = ?, output_pdf_path = COALESCE(?, output_pdf_path), error_text = ?, updated_at = ?
     WHERE id = ?`
  ).run(status, outputPdfPath, errorText, now, renderId)
}

function generateLatexBody(snapshot) {
  const lines = []
  const summary = String(snapshot?.summary || '').trim()
  if (summary) {
    lines.push('\\section*{Summary}')
    lines.push(summary.replace(/[%$&#_{}]/g, ''))
    lines.push('')
  }

  const skills = Array.isArray(snapshot?.skills) ? snapshot.skills : []
  if (skills.length > 0) {
    lines.push('\\section*{Skills}')
    lines.push(skills.map((s) => String(s).replace(/[%$&#_{}]/g, '')).join(' \\quad '))
    lines.push('')
  }

  return lines.join('\n')
}

async function runPdflatex({ workDir, texPath }) {
  return new Promise((resolve, reject) => {
    const proc = spawn('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', '-output-directory', workDir, texPath], {
      cwd: workDir,
      windowsHide: true,
    })

    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d.toString('utf8')
    })

    proc.on('error', (err) => {
      reject(err)
    })

    proc.on('close', (code) => {
      if (code === 0) return resolve()
      return reject(new Error(`pdflatex failed with code ${code}: ${stderr.slice(0, 2000)}`))
    })
  })
}

export async function processRender(job) {
  const started = Date.now()
  const { userId, resumeVersion, resumeVersionId, templateId, renderId } = job.data || {}

  if (!userId) throw new Error('resume_rendering: missing userId')
  if (!templateId) throw new Error('resume_rendering: missing templateId')
  if (!renderId) throw new Error('resume_rendering: missing renderId')

  const db = getDb()

  // Ensure render belongs to the user.
  const renderRow = db.prepare('SELECT * FROM resume_renders WHERE id = ? AND user_id = ? LIMIT 1').get(renderId, userId)
  if (!renderRow) throw new Error('Forbidden')
  if (Number(renderRow.template_id) !== Number(templateId)) throw new Error('Forbidden')

  let versionRow
  if (resumeVersionId) {
    versionRow = db
      .prepare(
        `SELECT rv.*
         FROM resume_versions rv
         JOIN resume_documents rd ON rd.id = rv.resume_document_id
         WHERE rv.id = ? AND rd.user_id = ?
         LIMIT 1`
      )
      .get(resumeVersionId, userId)
  } else if (resumeVersion) {
    const doc = db.prepare('SELECT id FROM resume_documents WHERE user_id = ?').get(userId)
    if (doc) {
      versionRow = db
        .prepare('SELECT * FROM resume_versions WHERE resume_document_id = ? AND version_label = ?')
        .get(doc.id, resumeVersion)
    }
  }

  if (!versionRow) throw new Error('resume_rendering: resume version not found')

  const snapshot = getResumeParsedSnapshot(db, versionRow.id)
  if (!snapshot) throw new Error('resume_rendering: missing parsed snapshot')

  const tmpl = db.prepare('SELECT * FROM latex_templates WHERE id = ?').get(templateId)
  if (!tmpl) throw new Error('resume_rendering: template not found')

  updateRenderStatus(db, renderId, { status: 'RENDERING' })

  try {
    const outDir = ensureDataDir(path.join('data', 'renders'))
    const workDir = path.join(outDir, String(renderId))
    await fs.mkdir(workDir, { recursive: true })

    const body = generateLatexBody(snapshot)

    const latex = String(tmpl.latex_source || '')
    if (!latex.includes('%%CONTENT%%')) {
      throw new Error("Template must contain '%%CONTENT%%' placeholder")
    }

    const tex = latex.replace('%%CONTENT%%', body)

    const texPath = path.join(workDir, 'resume.tex')
    await fs.writeFile(texPath, tex, 'utf8')

    await runPdflatex({ workDir, texPath })

    const pdfPath = path.join(workDir, 'resume.pdf')
    updateRenderStatus(db, renderId, { status: 'READY', outputPdfPath: pdfPath, errorText: null })

    logger.info(
      {
        jobId: job.id,
        renderId,
        userId,
        resumeVersion: versionRow.version_label,
        correlationId: job?.data?.correlationId || null,
        durationMs: Date.now() - started,
      },
      '[worker] resume_rendering complete'
    )

    return { ok: true, renderId, outputPdfPath: pdfPath, durationMs: Date.now() - started }
  } catch (err) {
    logger.error({ err, jobId: job?.id, renderId, userId }, '[worker] resume_rendering failed')
    updateRenderStatus(db, renderId, {
      status: 'FAILED',
      errorText: toPublicError(err, { fallbackMessage: 'Resume regeneration failed. Please retry.' }),
    })
    throw err
  }
}
