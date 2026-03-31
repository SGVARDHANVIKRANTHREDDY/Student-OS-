import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import Database from 'better-sqlite3'

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function parseArg(flag) {
  const idx = process.argv.indexOf(flag)
  if (idx === -1) return null
  return process.argv[idx + 1] || null
}

const email = normalizeEmail(parseArg('--email') || process.env.ADMIN_EMAIL)
const password = String(parseArg('--password') || process.env.ADMIN_PASSWORD || '')
const name = String(parseArg('--name') || process.env.ADMIN_NAME || 'Admin').trim() || 'Admin'

if (!email) {
  console.error('Missing --email (or ADMIN_EMAIL)')
  process.exit(2)
}
if (!password) {
  console.error('Missing --password (or ADMIN_PASSWORD)')
  process.exit(2)
}

const db = new Database('data/student-os.sqlite')

const now = new Date().toISOString()
const passwordHash = await bcrypt.hash(password, 12)

const existing = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(email)

if (existing) {
  db.prepare(
    `UPDATE users
     SET name = COALESCE(NULLIF(name, ''), ?),
         password_hash = ?,
         provider = 'local',
         role = 'admin',
         updated_at = ?
     WHERE email = ?`
  ).run(name, passwordHash, now, email)

  console.log(`Updated user to admin: ${email} (${existing.id})`)
} else {
  const id = crypto.randomUUID()

  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, provider, google_sub, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'local', NULL, 'admin', ?, ?)`
  ).run(id, email, name, passwordHash, now, now)

  console.log(`Created admin user: ${email} (${id})`)
}

console.log('Done. Next: POST /api/auth/login/admin with this email/password.')
