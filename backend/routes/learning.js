import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getDb } from '../lib/db.js'
import { isQueueingAvailable, getQueues, QUEUE_NAMES } from '../lib/queues.js'
import { enqueueWithTenantQuota } from '../lib/queues.js'
import { learningPlanGenerationJobName } from '../lib/jobPayloads.js'
import { redisRateLimit } from '../middleware/redisRateLimit.js'
import { writeAuditLog } from '../lib/auditDal.js'
import { recordJobQueued } from '../lib/jobStatusDal.js'
import { ACTIVITY_EVENT_TYPES, JOB_TYPES } from '../lib/activityTypes.js'
import { emitActivityEvent } from '../lib/activityDal.js'
import { getTenantIdFromRequest } from '../lib/tenancy.js'
import { checkAndIncrementUsage } from '../lib/billing.js'
import { hasPermission } from '../lib/rbac.js'
import { requireUserInTenant } from '../lib/tenantScope.js'
import { normalizeSkillId, upsertUserSkills } from '../lib/userSkillsDal.js'
import {
  requirePg as requirePgLearning,
  parseCursorPagination as parseLearningCursorPagination,
  listLearningResourcesCursor,
} from '../lib/learningResourcesDal.js'

const router = express.Router()

function canWriteCourses(req) {
  return hasPermission(req.auth, 'platform:admin') || hasPermission(req.auth, 'learning:courses:write')
}

function canReadCoursesAdmin(req) {
  return hasPermission(req.auth, 'platform:admin') || hasPermission(req.auth, 'learning:courses:read:any')
}

function rowToCourse(row, skills) {
  if (!row) return null
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    externalUrl: row.external_url,
    status: row.status,
    skills: Array.isArray(skills) ? skills : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const limitLearningRetry = redisRateLimit({
  keyPrefix: 'rl:learning_retry',
  windowSec: Number(process.env.RL_LEARNING_RETRY_WINDOW_SEC || 3600),
  max: Number(process.env.RL_LEARNING_RETRY_MAX || 10),
  getIdentity: (req) => ({
    tenantId: getTenantIdFromRequest(req),
    userId: req.user?.id || null,
    ip: req.ip,
    message: 'Too many retry requests. Please try again later.',
  }),
})

// Module 5: Learning resources search (tenant-scoped, cursor-based, Postgres-backed).
// GET /api/learning/resources?q=react&limit=20&cursor=...
router.get('/resources', authMiddleware, async (req, res, next) => {
  if (!requirePgLearning(res)) return

  const tenantId = getTenantIdFromRequest(req)
  const q = String(req.query?.q || '').trim()
  const paging = parseLearningCursorPagination(req)
  if (paging.cursorError) return res.status(400).json({ message: paging.cursorError })

  try {
    const data = await listLearningResourcesCursor({
      tenantId,
      q: q || null,
      limit: paging.limit,
      cursor: paging.cursor,
    })
    return res.json({ ...data, mode: 'cursor' })
  } catch (err) {
    return next(err)
  }
})

// Module 6: Curated external courses (tenant-scoped, operator-authored).
// GET /api/learning/courses -> students see APPROVED only
router.get('/courses', authMiddleware, (req, res) => {
  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)

  const rows = db
    .prepare(
      `SELECT id, name, description, image_url, external_url, status, created_at, updated_at
       FROM curated_courses
       WHERE tenant_id = ? AND status = 'APPROVED'
       ORDER BY updated_at DESC, id DESC
       LIMIT 200`
    )
    .all(tenantId)

  const ids = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n))
  const skillsByCourse = new Map()
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    const skillRows = db
      .prepare(
        `SELECT course_id, skill_name
         FROM curated_course_skills
         WHERE course_id IN (${placeholders})
         ORDER BY skill_name ASC`
      )
      .all(...ids)

    for (const r of skillRows) {
      const key = Number(r.course_id)
      const list = skillsByCourse.get(key) || []
      list.push(String(r.skill_name))
      skillsByCourse.set(key, list)
    }
  }

  return res.json({
    items: rows.map((r) => rowToCourse(r, skillsByCourse.get(Number(r.id)) || [])),
  })
})

// Admin/operator: list courses by status
router.get('/courses/admin', authMiddleware, (req, res) => {
  if (!canReadCoursesAdmin(req)) return res.status(403).json({ message: 'Forbidden' })
  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  const status = String(req.query?.status || '').trim().toUpperCase()
  const allowed = ['DRAFT', 'SUBMITTED', 'APPROVED', 'ARCHIVED']
  const effective = allowed.includes(status) ? status : null

  const where = ['tenant_id = ?']
  const params = [tenantId]
  if (effective) {
    where.push('status = ?')
    params.push(effective)
  }

  const rows = db
    .prepare(
      `SELECT id, name, description, image_url, external_url, status, created_at, updated_at
       FROM curated_courses
       WHERE ${where.join(' AND ')}
       ORDER BY updated_at DESC, id DESC
       LIMIT 500`
    )
    .all(...params)

  const ids = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n))
  const skillsByCourse = new Map()
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    const skillRows = db
      .prepare(
        `SELECT course_id, skill_name
         FROM curated_course_skills
         WHERE course_id IN (${placeholders})
         ORDER BY skill_name ASC`
      )
      .all(...ids)

    for (const r of skillRows) {
      const key = Number(r.course_id)
      const list = skillsByCourse.get(key) || []
      list.push(String(r.skill_name))
      skillsByCourse.set(key, list)
    }
  }

  return res.json({ items: rows.map((r) => rowToCourse(r, skillsByCourse.get(Number(r.id)) || [])) })
})

// POST /api/learning/courses - operator add
router.post('/courses', authMiddleware, (req, res) => {
  if (!canWriteCourses(req)) return res.status(403).json({ message: 'Forbidden' })

  const name = String(req.body?.name || '').trim()
  const description = String(req.body?.description || '').trim()
  const imageUrl = String(req.body?.imageUrl || '').trim()
  const externalUrl = String(req.body?.externalUrl || '').trim()
  const skills = Array.isArray(req.body?.skills) ? req.body.skills.map((s) => String(s || '').trim()).filter(Boolean) : []

  if (!name) return res.status(400).json({ message: 'name is required' })
  if (!externalUrl) return res.status(400).json({ message: 'externalUrl is required' })

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  const now = new Date().toISOString()

  db.prepare('BEGIN').run()
  try {
    const ins = db
      .prepare(
        `INSERT INTO curated_courses (tenant_id, name, description, image_url, external_url, status, created_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?)`
      )
      .run(tenantId, name, description, imageUrl, externalUrl, req.user?.id || null, now, now)

    const courseId = Number(ins.lastInsertRowid)

    if (skills.length) {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO curated_course_skills (course_id, normalized_skill_id, skill_name)
         VALUES (?, ?, ?)`
      )
      for (const s of skills.slice(0, 200)) {
        const nid = normalizeSkillId(s)
        if (!nid) continue
        stmt.run(courseId, nid, s)
      }
    }

    db.prepare('COMMIT').run()
    return res.status(201).json({ ok: true, id: courseId })
  } catch (err) {
    db.prepare('ROLLBACK').run()
    throw err
  }
})

// PATCH /api/learning/courses/:id - operator update
router.patch('/courses/:id', authMiddleware, (req, res) => {
  if (!canWriteCourses(req)) return res.status(403).json({ message: 'Forbidden' })
  const courseId = Number(req.params.id)
  if (!Number.isFinite(courseId)) return res.status(400).json({ message: 'Invalid course id' })

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  const now = new Date().toISOString()

  const fields = []
  const params = []

  if (req.body?.name !== undefined) {
    fields.push('name = ?')
    params.push(String(req.body.name || '').trim())
  }
  if (req.body?.description !== undefined) {
    fields.push('description = ?')
    params.push(String(req.body.description || '').trim())
  }
  if (req.body?.imageUrl !== undefined) {
    fields.push('image_url = ?')
    params.push(String(req.body.imageUrl || '').trim())
  }
  if (req.body?.externalUrl !== undefined) {
    fields.push('external_url = ?')
    params.push(String(req.body.externalUrl || '').trim())
  }
  if (req.body?.status !== undefined) {
    const st = String(req.body.status || '').trim().toUpperCase()
    if (!['DRAFT', 'SUBMITTED', 'APPROVED', 'ARCHIVED'].includes(st)) {
      return res.status(400).json({ message: 'Invalid status' })
    }
    fields.push('status = ?')
    params.push(st)
  }

  if (fields.length === 0 && req.body?.skills === undefined) return res.json({ ok: true })

  db.prepare('BEGIN').run()
  try {
    if (fields.length) {
      const sql = `UPDATE curated_courses SET ${fields.join(', ')}, updated_at = ? WHERE id = ? AND tenant_id = ?`
      db.prepare(sql).run(...params, now, courseId, tenantId)
    }

    if (req.body?.skills !== undefined) {
      const skills = Array.isArray(req.body.skills) ? req.body.skills.map((s) => String(s || '').trim()).filter(Boolean) : []
      db.prepare('DELETE FROM curated_course_skills WHERE course_id = ?').run(courseId)
      if (skills.length) {
        const stmt = db.prepare(
          `INSERT OR IGNORE INTO curated_course_skills (course_id, normalized_skill_id, skill_name)
           VALUES (?, ?, ?)`
        )
        for (const s of skills.slice(0, 200)) {
          const nid = normalizeSkillId(s)
          if (!nid) continue
          stmt.run(courseId, nid, s)
        }
      }
    }

    db.prepare('COMMIT').run()
    return res.json({ ok: true })
  } catch (err) {
    db.prepare('ROLLBACK').run()
    throw err
  }
})

// POST /api/learning/courses/:id/complete - student completion -> updates user_skills
router.post('/courses/:id/complete', authMiddleware, (req, res) => {
  const courseId = Number(req.params.id)
  if (!Number.isFinite(courseId)) return res.status(400).json({ message: 'Invalid course id' })

  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  const userId = req.user?.id
  if (!userId) return res.status(401).json({ message: 'Authentication required' })
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })

  const course = db
    .prepare('SELECT id, status FROM curated_courses WHERE id = ? AND tenant_id = ? LIMIT 1')
    .get(courseId, tenantId)
  if (!course) return res.status(404).json({ message: 'Course not found' })
  if (String(course.status) !== 'APPROVED') return res.status(409).json({ message: 'Course is not available' })

  const skillRows = db
    .prepare('SELECT skill_name FROM curated_course_skills WHERE course_id = ? ORDER BY skill_name ASC')
    .all(courseId)
  const skills = skillRows.map((r) => String(r.skill_name)).filter(Boolean)

  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO user_course_completions (tenant_id, user_id, course_id, status, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, 'COMPLETED', ?, ?, ?)
     ON CONFLICT(tenant_id, user_id, course_id) DO UPDATE SET
       completed_at = excluded.completed_at,
       updated_at = excluded.updated_at`
  ).run(tenantId, userId, courseId, now, now, now)

  // Learning completion updates skill proficiency (derived).
  if (skills.length) {
    try {
      upsertUserSkills(db, { tenantId, userId, skills, source: 'learning', proficiency: 60 })
    } catch {
      // best-effort
    }
  }

  return res.json({ ok: true, completedAt: now })
})

// Module 4: Manual retry for latest failed learning plan generation job.
router.post('/me/retry', authMiddleware, limitLearningRetry, async (req, res) => {
  if (!isQueueingAvailable()) {
    return res.status(503).json({ message: 'Learning plan queue is not available' })
  }

  const userId = req.user.id
  const db = getDb()

  const failed = db
    .prepare(
      `SELECT *
       FROM job_status_snapshots
       WHERE user_id = ? AND job_type = ? AND status = 'FAILED'
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get(userId, JOB_TYPES.LEARNING_PLAN)

  if (!failed) return res.status(404).json({ message: 'No failed learning plan job found' })

  const tenantId = getTenantIdFromRequest(req)
  const usage = checkAndIncrementUsage(db, { tenantId, featureKey: 'learning_retries_per_hour', incrementBy: 1, period: 'hour' })
  if (!usage.ok) {
    return res.status(429).json({
      message: usage.message,
      code: usage.code,
      limit: usage.limit ?? null,
      used: usage.used ?? null,
      period: usage.period ?? null,
    })
  }

  const scopeKey = String(failed.scope_key)
  const maxPerDay = Number(process.env.MANUAL_RETRY_MAX_PER_DAY || 3)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const c = db
    .prepare(
      `SELECT COUNT(1) AS n
       FROM audit_logs
       WHERE actor_user_id = ?
         AND action = 'MANUAL_RETRY'
         AND target_type = ?
         AND target_id = ?
         AND created_at >= ?`
    )
    .get(userId, JOB_TYPES.LEARNING_PLAN, scopeKey, cutoff)
  if (Number(c?.n || 0) >= maxPerDay) {
    return res.status(429).json({ message: 'Retry limit reached for today. Please try again later.' })
  }

  let payload
  try {
    payload = JSON.parse(failed.payload_json || '{}')
  } catch {
    payload = {}
  }
  payload.userId = userId
  payload.correlationId = req.id || null

  const queues = getQueues()
  const jobKey = `learn:retry:${userId}:${scopeKey}:${Date.now()}`

  try {
    recordJobQueued({
      userId,
      jobType: JOB_TYPES.LEARNING_PLAN,
      scopeType: failed.scope_type,
      scopeKey,
      queueName: QUEUE_NAMES.learningPlanGeneration,
      jobName: learningPlanGenerationJobName(),
      bullmqJobId: jobKey,
      correlationId: req.id || null,
      payload,
      maxAttempts: Number(process.env.BULLMQ_ATTEMPTS || 5),
    })
  } catch {
    // ignore
  }

  try {
    writeAuditLog({
      actorType: 'USER',
      actorUserId: userId,
      action: 'MANUAL_RETRY',
      targetType: JOB_TYPES.LEARNING_PLAN,
      targetId: scopeKey,
      metadata: { previousSnapshotId: failed.id },
      correlationId: req.id || null,
      db,
    })
  } catch {
    // ignore
  }

  try {
    emitActivityEvent({
      userId,
      type: ACTIVITY_EVENT_TYPES.MANUAL_RETRY_REQUESTED,
      source: 'API',
      status: 'SUCCESS',
      jobType: JOB_TYPES.LEARNING_PLAN,
      correlationId: req.id || null,
      metadata: { scopeKey },
      notify: false,
      db,
    })
  } catch {
    // ignore
  }

  const enq = await enqueueWithTenantQuota(queues.learningPlanGeneration, {
    jobName: learningPlanGenerationJobName(),
    payload,
    jobId: jobKey,
    tenantId,
    featureKey: 'enqueue_learning_plan_per_minute',
    windowSec: 60,
    defaultMax: 60,
  })

  if (!enq.ok) {
    return res.status(429).json({
      message: enq.message,
      code: enq.code,
      limit: enq.limit ?? null,
      used: enq.used ?? null,
      retryAfterSec: enq.retryAfterSec ?? 60,
    })
  }

  if (enq.warning) res.setHeader('X-StudentOS-Quota-Warn', enq.warning)
  return res.status(202).json({ ok: true, enqueued: true })
})

function parseJson(value, fallback) {
  try {
    const v = JSON.parse(value)
    return v === null || v === undefined ? fallback : v
  } catch {
    return fallback
  }
}

// Learning paths database with stages, concepts, mini-projects, and resources
const learningDatabase = {
  javascript: {
    name: 'JavaScript',
    totalWeeks: 6,
    stages: [
      {
        level: 'Foundation',
        weeks: 2,
        concepts: [
          'Variables & Data Types',
          'Operators & Control Flow',
          'Functions & Scope',
          'DOM Basics',
        ],
        tasks: [
          'Create a simple calculator with HTML/CSS/JS',
          'Build a to-do list app',
          'Make interactive form with validation',
        ],
        miniProjects: [
          {
            title: 'Interactive Calculator',
            description: 'Build a fully functional calculator with keyboard support',
            skills: ['DOM manipulation', 'Event listeners', 'String operations'],
            duration: '3 days',
            deliverable: 'Deployed HTML/CSS/JS app',
          },
          {
            title: 'Todo List App',
            description: 'Create a todo app with add/delete/edit functionality',
            skills: ['Array methods', 'DOM manipulation', 'Local storage'],
            duration: '4 days',
            deliverable: 'App with persistent data',
          },
        ],
        resources: [
          { title: 'MDN JavaScript Guide', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide' },
          { title: 'JavaScript.info Fundamentals', url: 'https://javascript.info/' },
          { title: 'DOM Reference', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model' },
        ],
      },
      {
        level: 'Intermediate',
        weeks: 2,
        concepts: [
          'Objects & Arrays',
          'Async & Promises',
          'ES6+ Features',
          'Error Handling',
        ],
        tasks: [
          'Build async data fetching application',
          'Create API wrapper with error handling',
          'Build weather app with API calls',
        ],
        miniProjects: [
          {
            title: 'Weather App',
            description: 'Fetch weather data from API and display with UI',
            skills: ['Async/await', 'Fetch API', 'Error handling', 'DOM updates'],
            duration: '5 days',
            deliverable: 'Working weather app with multiple cities',
          },
          {
            title: 'GitHub User Finder',
            description: 'Search GitHub users via API and display their profiles',
            skills: ['Promises', 'API integration', 'Data parsing'],
            duration: '4 days',
            deliverable: 'User search with repository listing',
          },
        ],
        resources: [
          { title: 'ES6+ Features Guide', url: 'https://github.com/lukehoban/es6features' },
          { title: 'Async/Await Tutorial', url: 'https://javascript.info/async-await' },
          { title: 'Fetch API Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API' },
        ],
      },
      {
        level: 'Advanced',
        weeks: 2,
        concepts: [
          'Closures & Higher-Order Functions',
          'Prototype & Inheritance',
          'Design Patterns',
          'Performance Optimization',
        ],
        tasks: [
          'Create reusable component library',
          'Build pub/sub event system',
          'Implement caching strategy',
        ],
        miniProjects: [
          {
            title: 'Custom Component Library',
            description: 'Build reusable modal, tooltip, and dropdown components',
            skills: ['Design patterns', 'Encapsulation', 'Reusability'],
            duration: '5 days',
            deliverable: 'Documented component library',
          },
          {
            title: 'Data Visualization Dashboard',
            description: 'Create interactive charts and real-time data updates',
            skills: ['Canvas API', 'Performance', 'Data structures'],
            duration: '6 days',
            deliverable: 'Dashboard with multiple chart types',
          },
        ],
        resources: [
          { title: 'You Don\'t Know JS', url: 'https://github.com/getify/You-Dont-Know-JS' },
          { title: 'JavaScript Design Patterns', url: 'https://www.patterns.dev/posts/classic-design-patterns/' },
        ],
      },
    ],
  },
  react: {
    name: 'React',
    totalWeeks: 8,
    stages: [
      {
        level: 'Foundation',
        weeks: 2,
        concepts: [
          'JSX & Components',
          'Props & State',
          'Hooks (useState, useEffect)',
          'Rendering & Re-renders',
        ],
        tasks: [
          'Create counter component',
          'Build form with state management',
          'Create component library',
        ],
        miniProjects: [
          {
            title: 'Counter App',
            description: 'Build counter with increment/decrement buttons',
            skills: ['React basics', 'State management', 'Event handling'],
            duration: '2 days',
            deliverable: 'Functional counter with tests',
          },
          {
            title: 'Todo List (React)',
            description: 'Rebuild todo app using React hooks',
            skills: ['useState', 'useEffect', 'Component lifecycle'],
            duration: '4 days',
            deliverable: 'Complete CRUD todo app',
          },
        ],
        resources: [
          { title: 'React Official Docs', url: 'https://react.dev' },
          { title: 'React Hooks Guide', url: 'https://react.dev/reference/react/hooks' },
        ],
      },
      {
        level: 'Intermediate',
        weeks: 3,
        concepts: [
          'Context API',
          'Custom Hooks',
          'useReducer',
          'Performance (memo, useCallback)',
          'Form Handling',
        ],
        tasks: [
          'Create global state management with Context',
          'Build custom hooks for reusability',
          'Create complex form with validation',
        ],
        miniProjects: [
          {
            title: 'Blog Platform',
            description: 'Build blog with posts, comments, and search',
            skills: ['Context API', 'Custom hooks', 'Data fetching'],
            duration: '5 days',
            deliverable: 'Full blog with CRUD operations',
          },
          {
            title: 'E-commerce Cart',
            description: 'Create shopping cart with product filters and checkout flow',
            skills: ['State management', 'Performance optimization', 'User flows'],
            duration: '6 days',
            deliverable: 'Working e-commerce interface',
          },
        ],
        resources: [
          { title: 'Advanced React Patterns', url: 'https://react.dev/learn' },
          { title: 'Custom Hooks Guide', url: 'https://react.dev/learn/reusing-logic-with-custom-hooks' },
        ],
      },
      {
        level: 'Advanced',
        weeks: 3,
        concepts: [
          'Code Splitting & Lazy Loading',
          'Server Components',
          'Advanced Patterns',
          'Testing (Jest, React Testing Library)',
          'Production Optimization',
        ],
        tasks: [
          'Implement lazy loading and code splitting',
          'Write comprehensive test suite',
          'Build reusable component library',
        ],
        miniProjects: [
          {
            title: 'Social Media Feed',
            description: 'Build infinite scroll feed with real-time updates',
            skills: ['Performance optimization', 'Advanced hooks', 'Testing'],
            duration: '6 days',
            deliverable: 'Production-ready feed component',
          },
          {
            title: 'Admin Dashboard',
            description: 'Create admin panel with tables, charts, and user management',
            skills: ['Complex state', 'Data visualization', 'Testing'],
            duration: '7 days',
            deliverable: 'Full-featured dashboard with tests',
          },
        ],
        resources: [
          { title: 'React Testing Guide', url: 'https://testing-library.com/react' },
          { title: 'Performance Optimization', url: 'https://react.dev/reference/react/memo' },
        ],
      },
    ],
  },
  python: {
    name: 'Python',
    totalWeeks: 6,
    stages: [
      {
        level: 'Foundation',
        weeks: 2,
        concepts: [
          'Syntax & Data Types',
          'Control Flow',
          'Functions & Modules',
          'File I/O',
        ],
        tasks: [
          'Write scripts for text processing',
          'Create utility functions',
          'Build simple CLI tool',
        ],
        miniProjects: [
          {
            title: 'Text Processing Tool',
            description: 'Create tool to analyze and transform text files',
            skills: ['File I/O', 'String operations', 'Functions'],
            duration: '3 days',
            deliverable: 'Working CLI tool',
          },
          {
            title: 'Password Manager CLI',
            description: 'Build password generator and storage system',
            skills: ['File handling', 'Encryption basics', 'Data structures'],
            duration: '4 days',
            deliverable: 'Functional password manager',
          },
        ],
        resources: [
          { title: 'Python Official Docs', url: 'https://docs.python.org/3/' },
          { title: 'Real Python Tutorials', url: 'https://realpython.com/' },
        ],
      },
      {
        level: 'Intermediate',
        weeks: 2,
        concepts: [
          'OOP Principles',
          'Exception Handling',
          'Working with APIs',
          'Data Processing (Pandas)',
        ],
        tasks: [
          'Build class-based applications',
          'Work with public APIs',
          'Analyze datasets',
        ],
        miniProjects: [
          {
            title: 'Stock Price Analyzer',
            description: 'Fetch stock data and perform analysis',
            skills: ['APIs', 'Data processing', 'File output'],
            duration: '5 days',
            deliverable: 'Analysis reports with charts',
          },
          {
            title: 'Web Scraper',
            description: 'Build web scraper with error handling',
            skills: ['BeautifulSoup', 'Requests', 'Data storage'],
            duration: '4 days',
            deliverable: 'Scraper with database storage',
          },
        ],
        resources: [
          { title: 'OOP in Python', url: 'https://docs.python.org/3/tutorial/classes.html' },
          { title: 'Requests Library', url: 'https://requests.readthedocs.io/' },
        ],
      },
      {
        level: 'Advanced',
        weeks: 2,
        concepts: [
          'Async Programming',
          'Testing & Debugging',
          'Performance Optimization',
          'Advanced Data Science',
        ],
        tasks: [
          'Build async applications',
          'Write comprehensive tests',
          'Create machine learning models',
        ],
        miniProjects: [
          {
            title: 'Real-time Data Pipeline',
            description: 'Build async data processing pipeline',
            skills: ['Async/await', 'Data processing', 'Error handling'],
            duration: '5 days',
            deliverable: 'Working data pipeline',
          },
          {
            title: 'ML Model with Evaluation',
            description: 'Build ML model with proper testing and validation',
            skills: ['Scikit-learn', 'Data analysis', 'Model evaluation'],
            duration: '6 days',
            deliverable: 'Trained model with metrics',
          },
        ],
        resources: [
          { title: 'Async IO Guide', url: 'https://docs.python.org/3/library/asyncio.html' },
          { title: 'Pytest Documentation', url: 'https://docs.pytest.org/' },
        ],
      },
    ],
  },
  'node.js': {
    name: 'Node.js',
    totalWeeks: 7,
    stages: [
      {
        level: 'Foundation',
        weeks: 2,
        concepts: [
          'Node.js Basics',
          'NPM & Modules',
          'Event Emitters',
          'Streams & Buffers',
        ],
        tasks: [
          'Create reusable modules',
          'Build file processing scripts',
          'Handle streaming data',
        ],
        miniProjects: [
          {
            title: 'CLI File Organizer',
            description: 'Create CLI to organize files by type',
            skills: ['File system', 'Events', 'CLI args'],
            duration: '3 days',
            deliverable: 'Working file organizer CLI',
          },
          {
            title: 'Log Parser',
            description: 'Parse and analyze application logs',
            skills: ['Streams', 'File I/O', 'Data analysis'],
            duration: '4 days',
            deliverable: 'Log analysis reports',
          },
        ],
        resources: [
          { title: 'Node.js Official Docs', url: 'https://nodejs.org/docs/' },
          { title: 'Node.js Event Emitter', url: 'https://nodejs.org/api/events.html' },
        ],
      },
      {
        level: 'Intermediate',
        weeks: 2,
        concepts: [
          'Express.js Fundamentals',
          'Middleware & Routing',
          'Request/Response Handling',
          'Error Handling',
        ],
        tasks: [
          'Build REST APIs',
          'Create custom middleware',
          'Handle authentication',
        ],
        miniProjects: [
          {
            title: 'REST API for Todo App',
            description: 'Create complete REST API with CRUD operations',
            skills: ['Express', 'Routing', 'HTTP methods', 'Status codes'],
            duration: '5 days',
            deliverable: 'Full REST API',
          },
          {
            title: 'Blog API',
            description: 'Build blog API with user authentication',
            skills: ['Middleware', 'JWT', 'Authorization'],
            duration: '5 days',
            deliverable: 'API with auth and CRUD',
          },
        ],
        resources: [
          { title: 'Express.js Guide', url: 'https://expressjs.com/' },
          { title: 'REST API Best Practices', url: 'https://restfulapi.net/' },
        ],
      },
      {
        level: 'Advanced',
        weeks: 3,
        concepts: [
          'Database Integration',
          'Caching Strategies',
          'API Security',
          'Testing & Deployment',
        ],
        tasks: [
          'Integrate with databases',
          'Implement caching',
          'Secure API endpoints',
          'Write integration tests',
        ],
        miniProjects: [
          {
            title: 'E-commerce API',
            description: 'Build complete e-commerce API with products, orders, users',
            skills: ['DB integration', 'Complex queries', 'Error handling'],
            duration: '6 days',
            deliverable: 'Production-ready API',
          },
          {
            title: 'Microservices Architecture',
            description: 'Build multiple services with inter-service communication',
            skills: ['Service design', 'API gateway', 'Error handling'],
            duration: '7 days',
            deliverable: 'Working microservices setup',
          },
        ],
        resources: [
          { title: 'Node.js Best Practices', url: 'https://github.com/goldbergyoni/nodebestpractices' },
          { title: 'Testing Node.js Apps', url: 'https://jestjs.io/' },
        ],
      },
    ],
  },
  sql: {
    name: 'SQL & Databases',
    totalWeeks: 6,
    stages: [
      {
        level: 'Foundation',
        weeks: 2,
        concepts: [
          'Database Design',
          'CRUD Operations',
          'Joins & Relationships',
          'Basic Queries',
        ],
        tasks: [
          'Design database schema',
          'Write SELECT queries',
          'Create relationships',
        ],
        miniProjects: [
          {
            title: 'School Database',
            description: 'Design and query school management database',
            skills: ['Schema design', 'Relations', 'Queries'],
            duration: '3 days',
            deliverable: 'Working database with queries',
          },
          {
            title: 'Library System DB',
            description: 'Create database for library with books, members, loans',
            skills: ['Normalization', 'Foreign keys', 'Joins'],
            duration: '4 days',
            deliverable: 'Normalized database',
          },
        ],
        resources: [
          { title: 'SQL Tutorial', url: 'https://sqlzoo.net/' },
          { title: 'Database Design', url: 'https://www.postgresql.org/docs/' },
        ],
      },
      {
        level: 'Intermediate',
        weeks: 2,
        concepts: [
          'Complex Queries',
          'Aggregation & Grouping',
          'Indexing & Performance',
          'Transactions',
        ],
        tasks: [
          'Write complex queries with subqueries',
          'Optimize query performance',
          'Handle transactions',
        ],
        miniProjects: [
          {
            title: 'Analytics Dashboard Queries',
            description: 'Create complex queries for business analytics',
            skills: ['Aggregation', 'Window functions', 'Performance'],
            duration: '4 days',
            deliverable: 'Set of optimized queries',
          },
          {
            title: 'E-commerce Reports',
            description: 'Generate sales, inventory, and customer reports',
            skills: ['Complex joins', 'Date functions', 'Aggregation'],
            duration: '4 days',
            deliverable: 'SQL report suite',
          },
        ],
        resources: [
          { title: 'Advanced SQL', url: 'https://mode.com/sql-tutorial/advanced/' },
          { title: 'Query Optimization', url: 'https://use-the-index-luke.com/' },
        ],
      },
      {
        level: 'Advanced',
        weeks: 2,
        concepts: [
          'Stored Procedures & Functions',
          'Views & Triggers',
          'Replication & Backup',
          'Performance Tuning',
        ],
        tasks: [
          'Create stored procedures',
          'Implement views and triggers',
          'Optimize large datasets',
        ],
        miniProjects: [
          {
            title: 'Reporting System',
            description: 'Create views and procedures for reporting',
            skills: ['Stored procedures', 'Views', 'Scheduling'],
            duration: '5 days',
            deliverable: 'Complete reporting system',
          },
          {
            title: 'Data Warehouse Schema',
            description: 'Design and implement data warehouse',
            skills: ['Dimensional modeling', 'Fact tables', 'Performance'],
            duration: '6 days',
            deliverable: 'Working data warehouse',
          },
        ],
        resources: [
          { title: 'Stored Procedures Guide', url: 'https://www.postgresql.org/docs/current/sql-syntax.html' },
          { title: 'Database Tuning', url: 'https://www.postgresql.org/docs/current/performance.html' },
        ],
      },
    ],
  },
  docker: {
    name: 'Docker & Containerization',
    totalWeeks: 5,
    stages: [
      {
        level: 'Foundation',
        weeks: 2,
        concepts: [
          'Docker Basics',
          'Images & Containers',
          'Dockerfile',
          'Docker Hub',
        ],
        tasks: [
          'Create Dockerfiles',
          'Build and run containers',
          'Push images to registry',
        ],
        miniProjects: [
          {
            title: 'Dockerize Node App',
            description: 'Create Docker setup for Node.js application',
            skills: ['Dockerfile', 'Images', 'Containers'],
            duration: '3 days',
            deliverable: 'Working Docker setup',
          },
          {
            title: 'Multi-stage Build',
            description: 'Create optimized multi-stage Docker build',
            skills: ['Build optimization', 'Size reduction', 'Best practices'],
            duration: '2 days',
            deliverable: 'Optimized Docker image',
          },
        ],
        resources: [
          { title: 'Docker Official Docs', url: 'https://docs.docker.com/' },
          { title: 'Dockerfile Reference', url: 'https://docs.docker.com/engine/reference/builder/' },
        ],
      },
      {
        level: 'Intermediate',
        weeks: 2,
        concepts: [
          'Docker Compose',
          'Networking',
          'Volumes & Data',
          'Environment Management',
        ],
        tasks: [
          'Create multi-container setups',
          'Manage networking',
          'Handle persistent data',
        ],
        miniProjects: [
          {
            title: 'Full Stack with Docker Compose',
            description: 'Containerize full app with frontend, backend, database',
            skills: ['Docker Compose', 'Networking', 'Volume management'],
            duration: '4 days',
            deliverable: 'Working Docker Compose setup',
          },
          {
            title: 'Local Development Environment',
            description: 'Create dev environment with all services',
            skills: ['Environment variables', 'Service communication', 'Logging'],
            duration: '3 days',
            deliverable: 'Reproducible dev setup',
          },
        ],
        resources: [
          { title: 'Docker Compose Guide', url: 'https://docs.docker.com/compose/' },
          { title: 'Docker Networking', url: 'https://docs.docker.com/network/' },
        ],
      },
      {
        level: 'Advanced',
        weeks: 1,
        concepts: [
          'Container Orchestration',
          'Registry & Security',
          'Monitoring & Logging',
          'Production Deployment',
        ],
        tasks: [
          'Set up container security',
          'Implement logging',
          'Create deployment pipelines',
        ],
        miniProjects: [
          {
            title: 'Private Docker Registry',
            description: 'Set up and manage private container registry',
            skills: ['Registry setup', 'Authentication', 'Mirroring'],
            duration: '3 days',
            deliverable: 'Working private registry',
          },
        ],
        resources: [
          { title: 'Docker Security', url: 'https://docs.docker.com/engine/security/' },
          { title: 'Container Best Practices', url: 'https://docs.docker.com/develop/dev-best-practices/' },
        ],
      },
    ],
  },
  aws: {
    name: 'AWS Cloud Platform',
    totalWeeks: 8,
    stages: [
      {
        level: 'Foundation',
        weeks: 2,
        concepts: [
          'AWS Account & IAM',
          'EC2 Basics',
          'S3 Storage',
          'VPC & Networking',
        ],
        tasks: [
          'Launch EC2 instances',
          'Create S3 buckets',
          'Configure IAM roles',
        ],
        miniProjects: [
          {
            title: 'Static Website Hosting',
            description: 'Host static site on S3 with CloudFront',
            skills: ['S3', 'CloudFront', 'Bucket policies'],
            duration: '2 days',
            deliverable: 'Hosted static site',
          },
          {
            title: 'EC2 Web Server Setup',
            description: 'Launch and configure EC2 instance with web server',
            skills: ['EC2', 'Security groups', 'SSH'],
            duration: '3 days',
            deliverable: 'Running web server',
          },
        ],
        resources: [
          { title: 'AWS Documentation', url: 'https://docs.aws.amazon.com/' },
          { title: 'AWS EC2 Guide', url: 'https://docs.aws.amazon.com/ec2/' },
        ],
      },
      {
        level: 'Intermediate',
        weeks: 3,
        concepts: [
          'RDS & Databases',
          'Lambda & Serverless',
          'API Gateway',
          'CloudWatch Monitoring',
        ],
        tasks: [
          'Create RDS database',
          'Build serverless functions',
          'Create REST APIs',
        ],
        miniProjects: [
          {
            title: 'Serverless Todo API',
            description: 'Build REST API with Lambda and API Gateway',
            skills: ['Lambda', 'API Gateway', 'DynamoDB'],
            duration: '4 days',
            deliverable: 'Working serverless API',
          },
          {
            title: 'Image Processing Pipeline',
            description: 'Create S3 trigger Lambda for image processing',
            skills: ['Lambda triggers', 'S3 events', 'Image libraries'],
            duration: '3 days',
            deliverable: 'Auto-processing pipeline',
          },
        ],
        resources: [
          { title: 'AWS Lambda Guide', url: 'https://docs.aws.amazon.com/lambda/' },
          { title: 'API Gateway', url: 'https://docs.aws.amazon.com/apigateway/' },
        ],
      },
      {
        level: 'Advanced',
        weeks: 3,
        concepts: [
          'Auto Scaling',
          'Load Balancing',
          'CI/CD Pipelines',
          'Security & Compliance',
        ],
        tasks: [
          'Set up auto-scaling',
          'Create deployment pipelines',
          'Implement monitoring & alerting',
        ],
        miniProjects: [
          {
            title: 'High-availability Application',
            description: 'Deploy app with auto-scaling and load balancing',
            skills: ['ALB', 'Auto Scaling', 'Health checks'],
            duration: '5 days',
            deliverable: 'HA application setup',
          },
          {
            title: 'CI/CD Pipeline',
            description: 'Create automated build and deployment pipeline',
            skills: ['CodePipeline', 'CodeBuild', 'CodeDeploy'],
            duration: '4 days',
            deliverable: 'Working CI/CD pipeline',
          },
        ],
        resources: [
          { title: 'AWS Auto Scaling', url: 'https://docs.aws.amazon.com/autoscaling/' },
          { title: 'AWS CodePipeline', url: 'https://docs.aws.amazon.com/codepipeline/' },
        ],
      },
    ],
  },
}

// GET /api/learning/:userId/paths - Get learning paths for missing skills
router.post('/:userId/paths', authMiddleware, (req, res) => {
  const { missingSkills } = req.body

  if (!missingSkills || !Array.isArray(missingSkills) || missingSkills.length === 0) {
    return res.status(400).json({ error: 'Missing skills array required' })
  }

  // Build ordered learning path
  const paths = []
  const skillMap = new Map()

  missingSkills.forEach((skill) => {
    const skillName = skill.name.toLowerCase()
    const skillKey = Object.keys(learningDatabase).find((key) => key === skillName || learningDatabase[key].name === skill.name)

    if (skillKey && learningDatabase[skillKey]) {
      const skillData = learningDatabase[skillKey]
      skillMap.set(skill.name, {
        skill: skill.name,
        importance: skill.importance,
        difficulty: skill.difficulty,
        totalWeeks: skillData.totalWeeks,
        path: skillData.stages.map((stage) => ({
          level: stage.level,
          weeks: stage.weeks,
          concepts: stage.concepts,
          miniProjects: stage.miniProjects,
          resources: stage.resources,
        })),
      })
    }
  })

  // Sort by importance (critical > high > medium > low) and then by difficulty
  const importanceOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  const difficultyOrder = { easy: 0, medium: 1, hard: 2 }

  const sortedPaths = Array.from(skillMap.values()).sort((a, b) => {
    const impCompare = importanceOrder[a.importance] - importanceOrder[b.importance]
    if (impCompare !== 0) return impCompare
    return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty]
  })

  res.json({
    totalSkills: missingSkills.length,
    totalWeeks: sortedPaths.reduce((sum, p) => sum + p.totalWeeks, 0),
    learningPath: sortedPaths,
    summary: {
      critical: sortedPaths.filter((p) => p.importance === 'critical').length,
      high: sortedPaths.filter((p) => p.importance === 'high').length,
      medium: sortedPaths.filter((p) => p.importance === 'medium').length,
    },
  })
})

// Module 3: Stored learning plans (generated by workers) + progress tracking.
router.get('/plans/me', authMiddleware, (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const tenantId = req.auth?.tenantId || null
  const jobId = String(req.query?.jobId || '').trim()
  const resumeVersion = String(req.query?.resumeVersion || '').trim()

  const where = ['user_id = ?', 'tenant_id IS ?']
  const params = [userId, tenantId ? String(tenantId) : null]

  if (jobId) {
    where.push('job_id = ?')
    params.push(jobId)
  }
  if (resumeVersion) {
    where.push('resume_version_label = ?')
    params.push(resumeVersion)
  }

  const rows = db
    .prepare(
      `SELECT id, job_id, resume_version_label, plan_version, status, rules_version, updated_at
       FROM learning_plans
       WHERE ${where.join(' AND ')}
       ORDER BY updated_at DESC
       LIMIT 50`
    )
    .all(...params)

  return res.json({
    items: rows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      resumeVersion: r.resume_version_label,
      planVersion: r.plan_version,
      status: r.status,
      rulesVersion: r.rules_version,
      updatedAt: r.updated_at,
    })),
  })
})

router.get('/plans/me/:planId', authMiddleware, (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const tenantId = req.auth?.tenantId || null
  const planId = Number(req.params.planId)
  if (!Number.isFinite(planId)) return res.status(400).json({ message: 'Invalid planId' })

  const plan = db
    .prepare(
      `SELECT id, job_id, resume_version_label, plan_version, status, rules_version, plan_json, created_at, updated_at
       FROM learning_plans
       WHERE id = ? AND user_id = ? AND tenant_id IS ?
       LIMIT 1`
    )
    .get(planId, userId, tenantId ? String(tenantId) : null)

  if (!plan) return res.status(404).json({ message: 'Plan not found' })

  const items = db
    .prepare(
      `SELECT item_key, title, status, started_at, completed_at, updated_at
       FROM learning_plan_items
       WHERE learning_plan_id = ?
       ORDER BY item_key ASC`
    )
    .all(planId)

  return res.json({
    plan: {
      id: plan.id,
      jobId: plan.job_id,
      resumeVersion: plan.resume_version_label,
      planVersion: plan.plan_version,
      status: plan.status,
      rulesVersion: plan.rules_version,
      createdAt: plan.created_at,
      updatedAt: plan.updated_at,
      data: parseJson(plan.plan_json, {}),
    },
    items: items.map((it) => ({
      key: it.item_key,
      title: it.title,
      status: it.status,
      startedAt: it.started_at || null,
      completedAt: it.completed_at || null,
      updatedAt: it.updated_at,
    })),
  })
})

router.patch('/plans/me/:planId/items/:itemKey', authMiddleware, (req, res) => {
  const db = getDb()
  const userId = req.user.id
  const tenantId = req.auth?.tenantId || null
  const planId = Number(req.params.planId)
  const itemKey = String(req.params.itemKey || '').trim()
  const status = String(req.body?.status || '').trim().toUpperCase()

  if (!Number.isFinite(planId)) return res.status(400).json({ message: 'Invalid planId' })
  if (!itemKey) return res.status(400).json({ message: 'itemKey is required' })
  if (!['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
    return res.status(400).json({ message: 'status must be NOT_STARTED, IN_PROGRESS, or COMPLETED' })
  }

  const plan = db
    .prepare('SELECT id FROM learning_plans WHERE id = ? AND user_id = ? AND tenant_id IS ?')
    .get(planId, userId, tenantId ? String(tenantId) : null)
  if (!plan) return res.status(404).json({ message: 'Plan not found' })

  const now = new Date().toISOString()
  const startedAt = status === 'IN_PROGRESS' ? now : null
  const completedAt = status === 'COMPLETED' ? now : null

  const result = db
    .prepare(
      `UPDATE learning_plan_items
       SET status = ?,
           started_at = COALESCE(?, started_at),
           completed_at = COALESCE(?, completed_at),
           updated_at = ?
       WHERE learning_plan_id = ? AND item_key = ?`
    )
    .run(status, startedAt, completedAt, now, planId, itemKey)

  if (result.changes === 0) return res.status(404).json({ message: 'Item not found' })
  return res.json({ ok: true, status, updatedAt: now })
})

export default router
