const TRACKS = {
  javascript: {
    name: 'JavaScript',
    resources: [
      { title: 'MDN JavaScript Guide', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide' },
      { title: 'JavaScript.info', url: 'https://javascript.info/' },
    ],
    items: [
      { key: 'js-fundamentals', title: 'Master JS fundamentals (types, functions, scope)' },
      { key: 'js-async', title: 'Async: promises, async/await, error handling' },
      { key: 'js-dom', title: 'DOM + events (if frontend)' },
    ],
  },
  react: {
    name: 'React',
    resources: [
      { title: 'React Docs', url: 'https://react.dev/learn' },
      { title: 'Vite + React Guide', url: 'https://vite.dev/guide/' },
    ],
    items: [
      { key: 'react-core', title: 'React core: components, props/state, hooks' },
      { key: 'react-data', title: 'Data fetching + state management basics' },
    ],
  },
  node: {
    name: 'Node.js Backend',
    resources: [
      { title: 'Node.js Docs', url: 'https://nodejs.org/en/docs' },
      { title: 'Express Guide', url: 'https://expressjs.com/en/guide/routing.html' },
    ],
    items: [
      { key: 'node-http', title: 'HTTP fundamentals + Express routing/middleware' },
      { key: 'node-auth', title: 'Auth basics: JWT/cookies, sessions, security headers' },
    ],
  },
  sql: {
    name: 'SQL + Databases',
    resources: [
      { title: 'PostgreSQL Tutorial', url: 'https://www.postgresql.org/docs/current/tutorial.html' },
      { title: 'SQLBolt', url: 'https://sqlbolt.com/' },
    ],
    items: [
      { key: 'sql-queries', title: 'Write SELECT/JOIN/GROUP BY queries' },
      { key: 'sql-indexing', title: 'Indexes + query plans (basics)' },
    ],
  },
  devops: {
    name: 'DevOps Basics',
    resources: [
      { title: 'Dockerfile reference', url: 'https://docs.docker.com/engine/reference/builder/' },
      { title: 'Docker Compose', url: 'https://docs.docker.com/compose/' },
    ],
    items: [
      { key: 'devops-docker', title: 'Containerize services with Docker + Compose' },
      { key: 'devops-cicd', title: 'CI/CD basics + environment config' },
    ],
  },
  system_design: {
    name: 'System Design',
    resources: [
      { title: 'System Design Primer', url: 'https://github.com/donnemartin/system-design-primer' },
    ],
    items: [
      { key: 'sd-fundamentals', title: 'Scalability fundamentals: caching, queues, DB' },
      { key: 'sd-tradeoffs', title: 'Trade-offs: consistency, latency, reliability' },
    ],
  },
  dsa: {
    name: 'DSA',
    resources: [
      { title: 'NeetCode Roadmap', url: 'https://neetcode.io/roadmap' },
    ],
    items: [
      { key: 'dsa-arrays', title: 'Arrays/strings + hashing patterns' },
      { key: 'dsa-trees', title: 'Trees/graphs patterns (BFS/DFS)' },
    ],
  },
}

const SKILL_TO_TRACK = {
  javascript: 'javascript',
  typescript: 'javascript',
  react: 'react',
  'node.js': 'node',
  node: 'node',
  express: 'node',
  sql: 'sql',
  postgresql: 'sql',
  mysql: 'sql',
  docker: 'devops',
  kubernetes: 'devops',
  'ci/cd': 'devops',
  linux: 'devops',
  aws: 'devops',
  redis: 'devops',
  'system design': 'system_design',
  dsa: 'dsa',
  algorithms: 'dsa',
  'data structures': 'dsa',
}

export const LEARNING_RULES_VERSION = process.env.LEARNING_RULES_VERSION || 'v1'

function nowIso() {
  return new Date().toISOString()
}

function normalizeSkillKey(s) {
  return String(s || '').trim().toLowerCase()
}

export function generateLearningPlanFromMissingSkills({ missingSkills, jobId, resumeVersionLabel }) {
  const missing = Array.isArray(missingSkills) ? missingSkills : []

  const trackCounts = new Map()
  for (const s of missing) {
    const key = normalizeSkillKey(s)
    const trackId = SKILL_TO_TRACK[key]
    if (!trackId) continue
    trackCounts.set(trackId, (trackCounts.get(trackId) || 0) + 1)
  }

  const rankedTracks = [...trackCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([trackId]) => trackId)

  const selected = rankedTracks.length > 0 ? rankedTracks.slice(0, 3) : ['javascript', 'sql']

  const tracks = selected
    .map((id) => ({ id, ...TRACKS[id] }))
    .filter((t) => t && t.name)

  const items = []
  for (const t of tracks) {
    for (const item of t.items) {
      items.push({
        key: `${t.id}:${item.key}`,
        title: item.title,
        trackId: t.id,
        status: 'NOT_STARTED',
      })
    }
  }

  return {
    schemaVersion: 1,
    rulesVersion: LEARNING_RULES_VERSION,
    generatedAt: nowIso(),
    jobId,
    resumeVersion: resumeVersionLabel,
    missingSkills: missing,
    tracks: tracks.map((t) => ({ id: t.id, name: t.name, resources: t.resources })),
    items,
  }
}
