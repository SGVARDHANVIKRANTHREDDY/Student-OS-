import { getDb, closeDb } from '../lib/db.js'

function usage() {
  console.log('Usage: node scripts/promote-admin.js <email>')
  console.log('Promotes an existing user to legacy role=admin (enables PLATFORM_ADMIN RBAC on next login).')
}

const rawEmail = process.argv[2]
if (!rawEmail) {
  usage()
  process.exit(1)
}

const email = String(rawEmail).trim().toLowerCase()
if (!email || !email.includes('@')) {
  console.error('Invalid email:', rawEmail)
  usage()
  process.exit(1)
}

const db = getDb()
try {
  const user = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(email)
  if (!user) {
    console.error('User not found:', email)
    process.exit(1)
  }

  const now = new Date().toISOString()
  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run('admin', now, user.id)

  console.log(`Promoted to admin: ${email}`)
  console.log('Now sign in at /admin/login with the same credentials.')
} finally {
  closeDb()
}
