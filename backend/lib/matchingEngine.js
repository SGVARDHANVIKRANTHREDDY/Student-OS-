const DEFAULT_SKILL_DICTIONARY = [
  'JavaScript',
  'TypeScript',
  'React',
  'Next.js',
  'Node.js',
  'Express',
  'Python',
  'Django',
  'Flask',
  'Java',
  'Go',
  'Rust',
  'SQL',
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Redis',
  'Git',
  'REST APIs',
  'GraphQL',
  'Docker',
  'Kubernetes',
  'Linux',
  'AWS',
  'GCP',
  'Azure',
  'CI/CD',
  'Testing',
  'System Design',
  'Data Structures',
  'Algorithms',
  'DSA',
]

export const MATCH_ALGORITHM_VERSION = 'v2'

export function normalizeSkills(skills) {
  const raw = Array.isArray(skills) ? skills : []
  const normalized = raw
    .map((s) => String(s || '').trim())
    .filter(Boolean)

  const seen = new Set()
  const out = []
  for (const s of normalized) {
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

export function extractSkillsFromText(text, { dictionary = DEFAULT_SKILL_DICTIONARY } = {}) {
  const t = String(text || '')
  if (!t.trim()) return []

  const found = []

  for (const skill of dictionary) {
    const needle = skill.toLowerCase()
    if (!needle) continue
    // Use word-boundary matching to avoid false positives
    // (e.g., "Java" should not match "JavaScript").
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?:^|[\\s,;|/()\\[\\]])${escaped}(?:[\\s,;|/()\\[\\]]|$)`, 'i')
    if (re.test(t)) found.push(skill)
  }

  return normalizeSkills(found)
}

export function computeExplainableMatch({ resumeSkills, jobSkills }) {
  const rs = normalizeSkills(resumeSkills)
  const js = normalizeSkills(jobSkills)

  const rsLower = new Set(rs.map((s) => s.toLowerCase()))

  const matched = []
  const missing = []

  for (const jobSkill of js) {
    if (rsLower.has(jobSkill.toLowerCase())) {
      matched.push(jobSkill)
    } else {
      missing.push(jobSkill)
    }
  }

  const score = jsLower.length === 0 ? 0 : Math.round((matched.length / jsLower.length) * 100)

  return {
    algorithmVersion: MATCH_ALGORITHM_VERSION,
    score: Math.max(0, Math.min(100, score)),
    strengths: matched,
    missingSkills: missing,
    breakdown: {
      matchedCount: matched.length,
      totalJobSkills: js.length,
      matchedSkills: matched,
      jobSkills: js,
    },
  }
}
