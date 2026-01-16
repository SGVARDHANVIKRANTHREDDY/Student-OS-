import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import { runMigrations } from './migrate.js'

let db

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export function getDb() {
  if (db) return db

  const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const defaultDbPath = path.join(baseDir, 'data', 'student-os.sqlite')
  const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : defaultDbPath
  ensureDir(path.dirname(dbPath))

  db = new Database(dbPath)
  runMigrations(db)

  return db
}

export function closeDb() {
  if (!db) return
  try {
    db.close()
  } finally {
    db = undefined
  }
}
