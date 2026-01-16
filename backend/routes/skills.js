import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { getDb } from '../lib/db.js'
import { getTenantIdFromRequest } from '../lib/tenancy.js'
import { hasPermission } from '../lib/rbac.js'
import { requireUserInTenant } from '../lib/tenantScope.js'
import { listUserSkills, upsertUserSkills } from '../lib/userSkillsDal.js'

const router = express.Router()

function canReadUserSkills(req, requestedUserId) {
  if (String(req.user?.id || '') === String(requestedUserId || '')) return true
  return hasPermission(req.auth, 'platform:admin') || hasPermission(req.auth, 'skills:profile:read:any')
}

function canWriteUserSkills(req, requestedUserId) {
  return hasPermission(req.auth, 'platform:admin') || hasPermission(req.auth, 'skills:profile:write:any')
}

// Mirror the preset roles from matching so skill-gaps works with roleId too.
const presetRoleSkills = {
  'frontend-engineer': {
    requiredSkills: ['JavaScript', 'React', 'HTML', 'CSS', 'Git'],
    preferredSkills: ['TypeScript', 'Testing', 'REST APIs', 'Responsive Design'],
  },
  'backend-engineer': {
    requiredSkills: ['Node.js', 'Python', 'Databases', 'REST APIs', 'Git'],
    preferredSkills: ['Docker', 'SQL', 'Authentication', 'Microservices'],
  },
  'full-stack-developer': {
    requiredSkills: ['JavaScript', 'React', 'Node.js', 'Databases', 'Git'],
    preferredSkills: ['TypeScript', 'Docker', 'AWS', 'Testing'],
  },
  'data-scientist': {
    requiredSkills: ['Python', 'SQL', 'Statistics', 'Machine Learning', 'Data Analysis'],
    preferredSkills: ['TensorFlow', 'Deep Learning', 'Big Data', 'Visualization'],
  },
  'devops-engineer': {
    requiredSkills: ['Docker', 'Linux', 'CI/CD', 'AWS', 'Git'],
    preferredSkills: ['Kubernetes', 'Terraform', 'Jenkins', 'Monitoring'],
  },
}

// Skill roadmaps with learning paths
const skillRoadmaps = {
  JavaScript: {
    level: 'beginner',
    path: ['Learn basics (variables, loops, functions)', 'DOM manipulation', 'ES6+ features', 'Async/Promises'],
    duration: '6-8 weeks',
  },
  React: {
    level: 'intermediate',
    path: ['Learn fundamentals (JSX, components)', 'State & Props', 'Hooks', 'Context API', 'Routing'],
    duration: '8-10 weeks',
  },
  Python: {
    level: 'beginner',
    path: ['Syntax & data types', 'Functions & modules', 'OOP concepts', 'Libraries (NumPy, Pandas)'],
    duration: '6-8 weeks',
  },
  'Node.js': {
    level: 'intermediate',
    path: ['Basics & modules', 'Express.js', 'Database integration', 'Authentication', 'Deployment'],
    duration: '8-10 weeks',
  },
  SQL: {
    level: 'beginner',
    path: ['Basic queries (SELECT, WHERE)', 'JOINs', 'Aggregation', 'Indexes', 'Optimization'],
    duration: '4-6 weeks',
  },
  Docker: {
    level: 'intermediate',
    path: ['Containers & images', 'Dockerfile', 'Docker Compose', 'Networking', 'Orchestration'],
    duration: '4-6 weeks',
  },
  AWS: {
    level: 'intermediate',
    path: ['EC2 & S3', 'RDS & Databases', 'Lambda & Serverless', 'VPC & Security', 'Cost optimization'],
    duration: '10-12 weeks',
  },
  'Machine Learning': {
    level: 'advanced',
    path: ['Math fundamentals', 'Libraries (Scikit-learn)', 'Algorithms', 'Deep Learning', 'Projects'],
    duration: '16-20 weeks',
  },
  'Problem Solving': {
    level: 'beginner',
    path: ['Algorithm basics', 'Data structures', 'Practice problems', 'LeetCode/HackerRank'],
    duration: '8-12 weeks',
  },
  Communication: {
    level: 'beginner',
    path: ['Writing skills', 'Presentation skills', 'Technical writing', 'Soft skills'],
    duration: '4-8 weeks',
  },
}

// Skill difficulty & importance
const skillMetadata = {
  // Must-have frontend
  JavaScript: { category: 'frontend', importance: 'critical', difficulty: 'medium' },
  React: { category: 'frontend', importance: 'critical', difficulty: 'medium' },
  HTML: { category: 'frontend', importance: 'critical', difficulty: 'easy' },
  CSS: { category: 'frontend', importance: 'critical', difficulty: 'easy' },

  // Must-have backend
  'Node.js': { category: 'backend', importance: 'critical', difficulty: 'medium' },
  Python: { category: 'backend', importance: 'critical', difficulty: 'easy' },
  SQL: { category: 'database', importance: 'critical', difficulty: 'medium' },
  'REST APIs': { category: 'backend', importance: 'critical', difficulty: 'medium' },

  // Infrastructure
  Git: { category: 'tools', importance: 'critical', difficulty: 'easy' },
  Docker: { category: 'devops', importance: 'high', difficulty: 'medium' },
  Linux: { category: 'devops', importance: 'high', difficulty: 'medium' },

  // Nice-to-have
  TypeScript: { category: 'frontend', importance: 'high', difficulty: 'medium' },
  AWS: { category: 'devops', importance: 'high', difficulty: 'hard' },
  Kubernetes: { category: 'devops', importance: 'medium', difficulty: 'hard' },
  'Machine Learning': { category: 'data', importance: 'high', difficulty: 'hard' },
  TensorFlow: { category: 'data', importance: 'medium', difficulty: 'hard' },
  'Deep Learning': { category: 'data', importance: 'medium', difficulty: 'hard' },

  // Soft skills
  'Problem Solving': { category: 'soft', importance: 'critical', difficulty: 'medium' },
  Communication: { category: 'soft', importance: 'critical', difficulty: 'medium' },
  'Team Collaboration': { category: 'soft', importance: 'high', difficulty: 'medium' },
  'Project Management': { category: 'soft', importance: 'medium', difficulty: 'medium' },
}

// Analyze skill gaps
router.post('/:userId/skill-gaps', authMiddleware, (req, res) => {
  const { userId } = req.params
  const { jobDescription, roleId } = req.body

  if (!jobDescription && !roleId) {
    return res.status(400).json({ message: 'Job description or role required' })
  }

  if (!canReadUserSkills(req, userId)) return res.status(403).json({ message: 'Forbidden' })
  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })

  const userSkills = listUserSkills(db, { tenantId, userId })
  const resumeSkills = userSkills.map((s) => s.name)

  // Get skills from job description and/or roleId
  const requiredSkillsFromJob = extractSkillsFromJob(jobDescription || '')
  const requiredSkillsFromRole = presetRoleSkills[roleId]
    ? [...presetRoleSkills[roleId].requiredSkills, ...presetRoleSkills[roleId].preferredSkills]
    : []

  const requiredSkillsCombined = [...new Set([...requiredSkillsFromRole, ...requiredSkillsFromJob])]
  
  const mustHaves = []
  const goodToHaves = []

  // Categorize skills
  requiredSkillsCombined.forEach((skill) => {
    const meta = skillMetadata[skill]
    if (meta && (meta.importance === 'critical' || meta.importance === 'high')) {
      mustHaves.push({
        name: skill,
        importance: meta.importance,
        category: meta.category,
        difficulty: meta.difficulty,
        roadmap: skillRoadmaps[skill] || null,
      })
    } else {
      goodToHaves.push({
        name: skill,
        importance: meta ? meta.importance : 'medium',
        category: meta ? meta.category : 'other',
        difficulty: meta ? meta.difficulty : 'medium',
        roadmap: skillRoadmaps[skill] || null,
      })
    }
  })

  // Find missing skills
  const resumeSkillsLower = (resumeSkills || []).map((s) => s.toLowerCase())
  const missing = []

  const allSkills = [...mustHaves, ...goodToHaves]
  allSkills.forEach((skill) => {
    const hasSkill = resumeSkillsLower.some(
      (rs) => rs.includes(skill.name.toLowerCase()) || skill.name.toLowerCase().includes(rs)
    )

    if (!hasSkill) {
      missing.push(skill)
    }
  })

  // Sort missing skills by priority
  missing.sort((a, b) => {
    const importanceOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    if (importanceOrder[a.importance] !== importanceOrder[b.importance]) {
      return importanceOrder[a.importance] - importanceOrder[b.importance]
    }
    const difficultyOrder = { easy: 0, medium: 1, hard: 2 }
    return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty]
  })

  res.json({
    mustHaves: mustHaves.sort((a, b) => {
      const importanceOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      return (importanceOrder[a.importance] ?? 99) - (importanceOrder[b.importance] ?? 99)
    }),
    goodToHaves: goodToHaves.sort((a, b) => {
      const importanceOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      return (importanceOrder[a.importance] ?? 99) - (importanceOrder[b.importance] ?? 99)
    }),
    missingSkills: missing,
    totalSkillsRequired: allSkills.length,
    skillsCovered: allSkills.length - missing.length,
  })
})

// GET /api/skills/me - first-class persistent skills profile
router.get('/me', authMiddleware, (req, res) => {
  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  const userId = req.user?.id
  if (!userId) return res.status(401).json({ message: 'Authentication required' })
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })

  const skills = listUserSkills(db, { tenantId, userId })
  return res.json({ items: skills })
})

// POST /api/skills/me - optional manual skill add (personal profile)
router.post('/me', authMiddleware, (req, res) => {
  const db = getDb()
  const tenantId = getTenantIdFromRequest(req)
  const userId = req.user?.id
  if (!userId) return res.status(401).json({ message: 'Authentication required' })
  if (!requireUserInTenant(db, { tenantId, userId })) return res.status(403).json({ message: 'Forbidden' })

  // Student OS contract: student skills are read-only (derived from resume + learning completion).
  if (!canWriteUserSkills(req, userId)) return res.status(403).json({ message: 'Forbidden' })

  const skills = Array.isArray(req.body?.skills) ? req.body.skills : []
  upsertUserSkills(db, { tenantId, userId, skills, source: 'admin', proficiency: 30 })
  const items = listUserSkills(db, { tenantId, userId })
  return res.json({ ok: true, items })
})

// Helper: Extract skills from job description
function extractSkillsFromJob(text) {
  const skillPatterns = {
    JavaScript: ['javascript', 'js'],
    React: ['react', 'reactjs'],
    'Node.js': ['nodejs', 'node.js', 'node'],
    Python: ['python'],
    SQL: ['sql', 'database'],
    Docker: ['docker'],
    AWS: ['aws', 'amazon'],
    Linux: ['linux', 'unix'],
    Git: ['git'],
    HTML: ['html'],
    CSS: ['css'],
    TypeScript: ['typescript', 'ts'],
    Kubernetes: ['kubernetes', 'k8s'],
    'Machine Learning': ['machine learning', 'ml', 'ai', 'artificial intelligence'],
    TensorFlow: ['tensorflow'],
    'Deep Learning': ['deep learning'],
    'REST APIs': ['rest api', 'rest'],
    'Problem Solving': ['problem solving', 'algorithmic'],
    Communication: ['communication', 'writing', 'documentation'],
    'Team Collaboration': ['team', 'collaboration', 'collaboration'],
    'Project Management': ['project management', 'agile', 'scrum'],
  }

  const lowerText = text.toLowerCase()
  const found = []

  Object.entries(skillPatterns).forEach(([skill, patterns]) => {
    patterns.forEach((pattern) => {
      if (lowerText.includes(pattern)) {
        found.push(skill)
      }
    })
  })

  return [...new Set(found)]
}

export default router
