import express from 'express'
import authMiddleware from '../middleware/auth.js'

const router = express.Router()

// Minimal, practical, company+role-based prep roadmaps.
// In-memory by design (fits current app architecture).

const companies = {
  amazon: { id: 'amazon', name: 'Amazon' },
  tcs: { id: 'tcs', name: 'TCS' },
  infosys: { id: 'infosys', name: 'Infosys' },
}

const roles = {
  'sde-intern': { id: 'sde-intern', name: 'SDE Intern' },
  'frontend-intern': { id: 'frontend-intern', name: 'Frontend Intern' },
  'data-analyst-intern': { id: 'data-analyst-intern', name: 'Data Analyst Intern' },
}

const baseRoleRoadmaps = {
  'sde-intern': {
    focus: ['DSA fundamentals', 'Problem solving speed', 'Core projects', 'Interview communication'],
    dsa: {
      foundations: ['Big-O basics', 'Arrays & Strings', 'Hashing basics', 'Recursion basics'],
      core: ['Two pointers', 'Sliding window', 'Stacks/Queues', 'Binary search', 'Linked List', 'Trees basics'],
      advanced: ['Heaps', 'Graphs basics', 'DP basics (1D/2D)', 'Greedy basics'],
    },
    projects: [
      {
        title: 'Student OS API (Mini)',
        outcome: 'Build a REST API with auth + CRUD, clean error handling',
        scope: ['JWT auth', 'CRUD module (tasks)', 'input validation', 'basic tests (manual)'],
      },
      {
        title: 'System Design Lite: URL Shortener',
        outcome: 'Explain design + implement a minimal working version',
        scope: ['API endpoints', 'hash/id strategy', 'rate-limit concept (text)', 'basic storage (in-memory)'],
      },
    ],
    resumeChecklist: [
      '1-page ATS resume',
      '2–3 impact bullets per project (numbers if possible)',
      'DSA proof: contest/LeetCode stats OR 20–30 solved list (text)',
      'Clear tech stack line: JS/Node/React/SQL etc',
    ],
    mockSuggestions: [
      'Mock 1: DSA (arrays/strings) + explain approach out loud',
      'Mock 2: Trees/graphs basics + complexity questions',
      'Mock 3: Project deep-dive (tradeoffs, failures, what you’d improve)',
    ],
  },
  'frontend-intern': {
    focus: ['React fundamentals', 'UI building speed', 'API integration', 'Debugging'],
    dsa: {
      foundations: ['Basic complexity', 'Arrays & Strings basics'],
      core: ['Objects/Maps usage', 'Simple recursion', 'Sorting basics'],
      advanced: ['Not required; focus on UI + debugging'],
    },
    projects: [
      {
        title: 'ATS Resume Builder UI',
        outcome: 'Build a clean resume builder with preview + scoring',
        scope: ['React forms', 'state management', 'preview component', 'basic validations'],
      },
      {
        title: 'Job Match Dashboard',
        outcome: 'Role select + match output + skill gap view',
        scope: ['Fetch APIs', 'loading/error states', 'charts (simple bars)', 'export summary (text)'],
      },
    ],
    resumeChecklist: [
      'Link 2 deployed UIs (Vite) + GitHub',
      'Highlight accessibility basics (labels, keyboard)',
      'Show one “engineering” bullet (performance, error handling, refactor)',
    ],
    mockSuggestions: [
      'Mock 1: Debug a UI bug (state, props, effect dependencies)',
      'Mock 2: Build a component live (form + list + filter)',
      'Mock 3: Explain API integration + error states',
    ],
  },
  'data-analyst-intern': {
    focus: ['SQL + analysis', 'clean data thinking', 'basic dashboards', 'storytelling'],
    dsa: {
      foundations: ['Basic complexity'],
      core: ['SQL joins thinking', 'aggregation/grouping mindset'],
      advanced: ['Not required; focus on analysis depth'],
    },
    projects: [
      {
        title: 'Placement Insights Dashboard (Text + Charts)',
        outcome: 'Analyze a dataset and explain insights clearly',
        scope: ['cleaning rules', '3–5 insights', 'simple charts', 'executive summary'],
      },
      {
        title: 'SQL Case Study',
        outcome: 'Write 15–20 queries (joins, aggregates, window functions)',
        scope: ['schema design', 'query set', 'explain each query'],
      },
    ],
    resumeChecklist: [
      'SQL projects with clear metrics',
      'One dashboard project with insights and business recommendations',
      'Strong summary: tools + what you analyze',
    ],
    mockSuggestions: [
      'Mock 1: SQL joins + grouping live',
      'Mock 2: Explain an insight and why it matters',
      'Mock 3: Data cleaning decisions and tradeoffs',
    ],
  },
}

const companyOverlays = {
  amazon: {
    notes: ['High DSA weight', 'Clear project deep-dive', 'Strong problem-solving communication'],
    addDSA: ['More practice on trees/graphs', 'DP basics (patterns)', 'Time-space tradeoffs'],
    addResume: ['Include 1 “scale” bullet: performance or efficiency'],
  },
  tcs: {
    notes: ['Strong fundamentals', 'Consistency', 'Clear basics + communication'],
    addDSA: ['Basics of aptitude-style reasoning (text practice)'],
    addResume: ['Highlight internships/training + measurable outcomes'],
  },
  infosys: {
    notes: ['Good fundamentals', 'Project clarity', 'Communication'],
    addDSA: ['Problem solving basics + clean code'],
    addResume: ['Add “teamwork” and “ownership” bullets'],
  },
}

function buildRoadmap(companyId, roleId) {
  const company = companies[companyId]
  const role = roles[roleId]
  if (!company || !role) return null

  const base = baseRoleRoadmaps[roleId]
  const overlay = companyOverlays[companyId] || { notes: [] }

  return {
    company,
    role,
    title: `${company.name} — ${role.name} Placement Roadmap`,
    outcomes: base.focus,
    companyNotes: overlay.notes || [],
    dsaTopics: {
      foundations: base.dsa.foundations,
      core: base.dsa.core,
      advanced: base.dsa.advanced,
      companyFocus: overlay.addDSA || [],
    },
    projects: base.projects,
    resumeChecklist: [...base.resumeChecklist, ...(overlay.addResume || [])],
    mockSuggestions: base.mockSuggestions,
  }
}

router.get('/companies', authMiddleware, (req, res) => {
  res.json(Object.values(companies))
})

router.get('/roles', authMiddleware, (req, res) => {
  res.json(Object.values(roles))
})

router.get('/:companyId/:roleId', authMiddleware, (req, res) => {
  const { companyId, roleId } = req.params
  const roadmap = buildRoadmap(companyId, roleId)

  if (!roadmap) {
    return res.status(404).json({ message: 'Roadmap not found' })
  }

  res.json(roadmap)
})

export default router
