import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const RESUME_STATUS = {
  uploaded: 'UPLOADED',
  parsing: 'PARSING',
  parsed: 'PARSED',
  failed: 'FAILED',
  outdated: 'OUTDATED',
}

export function resumeStatuses() {
  return { ...RESUME_STATUS }
}

function nowIso() {
  return new Date().toISOString()
}

function baseDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

export function ensureDataDir(relPath) {
  const full = path.join(baseDir(), relPath)
  fs.mkdirSync(full, { recursive: true })
  return full
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalize(value[key])
  }
  return out
}

export function sha256HexFromString(str) {
  return crypto.createHash('sha256').update(str).digest('hex')
}

export function sha256HexFromJson(value) {
  return sha256HexFromString(JSON.stringify(canonicalize(value)))
}

export async function sha256HexFromFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function ensureResumeDocument(db, userId) {
  const now = nowIso()
  db.prepare(
    `INSERT OR IGNORE INTO resume_documents (user_id, current_version, created_at, updated_at)
     VALUES (?, 0, ?, ?)`
  ).run(userId, now, now)

  return db.prepare('SELECT * FROM resume_documents WHERE user_id = ?').get(userId)
}

export function getLatestResumeVersion(db, userId) {
  const doc = db.prepare('SELECT id, current_version FROM resume_documents WHERE user_id = ?').get(userId)
  if (!doc) return null
  if (!doc.current_version) return null

  return db
    .prepare(
      `SELECT * FROM resume_versions
       WHERE resume_document_id = ? AND version = ?
       LIMIT 1`
    )
    .get(doc.id, doc.current_version)
}

export function getResumeVersionByLabel(db, userId, versionLabel) {
  const doc = db.prepare('SELECT id FROM resume_documents WHERE user_id = ?').get(userId)
  if (!doc) return null
  return db
    .prepare(
      `SELECT * FROM resume_versions
       WHERE resume_document_id = ? AND version_label = ?
       LIMIT 1`
    )
    .get(doc.id, versionLabel)
}

export function getResumeParsedSnapshot(db, resumeVersionId) {
  const row = db.prepare('SELECT data_json FROM resume_parsed_snapshots WHERE resume_version_id = ?').get(resumeVersionId)
  if (!row?.data_json) return null
  try {
    return JSON.parse(row.data_json)
  } catch {
    return null
  }
}

export function upsertResumeParsedSnapshot(db, resumeVersionId, snapshot) {
  const now = nowIso()
  db.prepare(
    `INSERT INTO resume_parsed_snapshots (resume_version_id, data_json, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(resume_version_id) DO UPDATE
       SET data_json = excluded.data_json`
  ).run(resumeVersionId, JSON.stringify(snapshot), now)
}

export function setResumeVersionStatus(db, resumeVersionId, { status, errorText = null, parsedAt = null }) {
  const now = nowIso()
  db.prepare(
    `UPDATE resume_versions
     SET status = ?, error_text = ?, parsed_at = COALESCE(?, parsed_at), updated_at = ?
     WHERE id = ?`
  ).run(status, errorText, parsedAt, now, resumeVersionId)
}

export function ensureResumeVersionForStructured(db, { userId, structuredResume, sourceMeta = {} }) {
  const doc = ensureResumeDocument(db, userId)
  const hash = sha256HexFromJson(structuredResume)

  // Idempotency: if the same content hash already exists for this user, return it.
  const existing = db
    .prepare(
      `SELECT rv.*
       FROM resume_versions rv
       WHERE rv.resume_document_id = ? AND rv.content_hash = ?
       ORDER BY rv.version DESC
       LIMIT 1`
    )
    .get(doc.id, hash)

  if (existing) {
    // Keep legacy resume table in sync via caller.
    return { ok: true, deduped: true, version: existing }
  }

  const now = nowIso()
  const nextVersion = Number(doc.current_version || 0) + 1
  const versionLabel = `resume_v${nextVersion}`

  const ins = db
    .prepare(
      `INSERT INTO resume_versions
        (resume_document_id, version, version_label, source_type, source_meta_json, content_hash, status, created_at, updated_at)
       VALUES (?, ?, ?, 'form', ?, ?, ?, ?, ?)`
    )
    .run(doc.id, nextVersion, versionLabel, JSON.stringify(sourceMeta || {}), hash, RESUME_STATUS.uploaded, now, now)

  db.prepare('UPDATE resume_documents SET current_version = ?, updated_at = ? WHERE id = ?').run(nextVersion, now, doc.id)

  const version = db.prepare('SELECT * FROM resume_versions WHERE id = ?').get(ins.lastInsertRowid)
  // Store the structured resume immediately as the initial snapshot for downstream jobs.
  upsertResumeParsedSnapshot(db, version.id, structuredResume)

  return { ok: true, deduped: false, version }
}

export function ensureResumeVersionForUpload(db, { userId, contentHash, fileMeta }) {
  const doc = ensureResumeDocument(db, userId)

  const existing = db
    .prepare(
      `SELECT rv.*
       FROM resume_versions rv
       WHERE rv.resume_document_id = ? AND rv.content_hash = ?
       ORDER BY rv.version DESC
       LIMIT 1`
    )
    .get(doc.id, contentHash)

  if (existing) {
    return { ok: true, deduped: true, version: existing }
  }

  const now = nowIso()
  const nextVersion = Number(doc.current_version || 0) + 1
  const versionLabel = `resume_v${nextVersion}`

  const ins = db
    .prepare(
      `INSERT INTO resume_versions
        (resume_document_id, version, version_label, source_type, source_meta_json, content_hash, status, created_at, updated_at)
       VALUES (?, ?, ?, 'upload', ?, ?, ?, ?, ?)`
    )
    .run(doc.id, nextVersion, versionLabel, JSON.stringify(fileMeta?.sourceMeta || {}), contentHash, RESUME_STATUS.uploaded, now, now)

  db.prepare('UPDATE resume_documents SET current_version = ?, updated_at = ? WHERE id = ?').run(nextVersion, now, doc.id)

  const resumeVersionId = ins.lastInsertRowid
  const { storagePath, mimeType, sizeBytes, originalFilename } = fileMeta

  db.prepare(
    `INSERT INTO resume_files (resume_version_id, storage_path, mime_type, size_bytes, original_filename, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(resumeVersionId, storagePath, mimeType || 'application/pdf', sizeBytes ?? null, originalFilename ?? null, now)

  const version = db.prepare('SELECT * FROM resume_versions WHERE id = ?').get(resumeVersionId)
  return { ok: true, deduped: false, version }
}

export function listResumeVersions(db, userId) {
  const doc = db.prepare('SELECT id FROM resume_documents WHERE user_id = ?').get(userId)
  if (!doc) return []

  return db
    .prepare(
      `SELECT id, version, version_label, source_type, content_hash, status, error_text, created_at, updated_at, parsed_at
       FROM resume_versions
       WHERE resume_document_id = ?
       ORDER BY version DESC`
    )
    .all(doc.id)
}

export function upsertLegacyResume(db, userId, structuredResume) {
  const now = nowIso()
  db.prepare(
    `INSERT INTO resumes (user_id, data_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`
  ).run(userId, JSON.stringify(structuredResume), now)
}
