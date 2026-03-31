import { describe, it, expect } from 'vitest'
import {
  trimmedString,
  nonEmptyString,
  email,
  positiveInt,
  nonNegativeInt,
  paginationQuery,
  cursorPaginationQuery,
  loginBody,
  signupBody,
  profileBody,
  subjectBody,
  assignmentBody,
  examBody,
  userIdParam,
  idParam,
  notificationsQuery,
  activityQuery,
  attendanceBody,
  googleAuthBody,
  jobIdParam,
  applicationStatusBody,
  resumeSaveBody,
  resumeTemplateBody,
  resumeRenderBody,
  renderIdParam,
  matchEnqueueBody,
  adminUsersQuery,
  courseBody,
  courseUpdateBody,
  courseAdminQuery,
} from '../../lib/schemas.js'

// ── Primitives ────────────────────────────────────────────────

describe('Primitive schemas', () => {
  it('trimmedString trims whitespace', () => {
    expect(trimmedString.parse('  hello  ')).toBe('hello')
  })

  it('nonEmptyString rejects empty', () => {
    expect(() => nonEmptyString.parse('')).toThrow()
    expect(nonEmptyString.parse('x')).toBe('x')
  })

  it('email validates and lowercases', () => {
    expect(email.parse('  USER@Example.COM  ')).toBe('user@example.com')
    expect(() => email.parse('not-an-email')).toThrow()
  })

  it('positiveInt coerces and rejects non-positive', () => {
    expect(positiveInt.parse('5')).toBe(5)
    expect(() => positiveInt.parse('0')).toThrow()
    expect(() => positiveInt.parse('-1')).toThrow()
    expect(() => positiveInt.parse('abc')).toThrow()
  })

  it('nonNegativeInt allows zero', () => {
    expect(nonNegativeInt.parse('0')).toBe(0)
    expect(nonNegativeInt.parse('10')).toBe(10)
    expect(() => nonNegativeInt.parse('-1')).toThrow()
  })
})

// ── Pagination ────────────────────────────────────────────────

describe('Pagination schemas', () => {
  it('paginationQuery applies defaults', () => {
    const result = paginationQuery.parse({})
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(50)
  })

  it('paginationQuery rejects oversized pageSize', () => {
    expect(() => paginationQuery.parse({ pageSize: 500 })).toThrow()
  })

  it('cursorPaginationQuery accepts optional cursor', () => {
    const result = cursorPaginationQuery.parse({})
    expect(result.cursor).toBeUndefined()
    expect(result.limit).toBe(50)
  })
})

// ── Auth ──────────────────────────────────────────────────────

describe('Auth schemas', () => {
  it('loginBody requires email and password', () => {
    const result = loginBody.parse({ email: 'a@b.com', password: 'secret' })
    expect(result.email).toBe('a@b.com')
    expect(result.password).toBe('secret')
  })

  it('loginBody rejects missing fields', () => {
    expect(() => loginBody.parse({})).toThrow()
    expect(() => loginBody.parse({ email: 'a@b.com' })).toThrow()
  })

  it('signupBody enforces password >= 8 chars', () => {
    expect(() => signupBody.parse({ name: 'A', email: 'a@b.com', password: '1234567' })).toThrow()
    const ok = signupBody.parse({ name: 'A', email: 'a@b.com', password: '12345678' })
    expect(ok.password).toBe('12345678')
  })

  it('googleAuthBody requires credential', () => {
    expect(() => googleAuthBody.parse({})).toThrow()
    expect(googleAuthBody.parse({ credential: 'tok' }).credential).toBe('tok')
  })
})

// ── Profile ──────────────────────────────────────────────────

describe('Profile schema', () => {
  it('profileBody accepts all-optional fields', () => {
    const result = profileBody.parse({})
    expect(result).toEqual({})
  })

  it('profileBody trims strings', () => {
    const result = profileBody.parse({ college: '  MIT  ', branch: '  CSE  ' })
    expect(result.college).toBe('MIT')
    expect(result.branch).toBe('CSE')
  })
})

// ── Academics ────────────────────────────────────────────────

describe('Academic schemas', () => {
  it('subjectBody validates score range', () => {
    expect(() => subjectBody.parse({ subject: 'Math', score: -1 })).toThrow()
    expect(() => subjectBody.parse({ subject: 'Math', score: 101 })).toThrow()
    const ok = subjectBody.parse({ subject: 'Math', score: '85' })
    expect(ok.score).toBe(85)
    expect(ok.grade).toBe('N/A')
  })

  it('assignmentBody applies defaults', () => {
    const result = assignmentBody.parse({ title: 'HW1', dueDate: '2026-01-01' })
    expect(result.status).toBe('pending')
    expect(result.description).toBe('')
  })

  it('examBody validates required fields', () => {
    expect(() => examBody.parse({})).toThrow()
    const ok = examBody.parse({ subject: 'Physics', date: '2026-06-15' })
    expect(ok.time).toBe('10:00 AM')
  })
})

// ── ID Params ────────────────────────────────────────────────

describe('ID param schemas', () => {
  it('userIdParam requires non-empty userId', () => {
    expect(() => userIdParam.parse({ userId: '' })).toThrow()
    expect(userIdParam.parse({ userId: 'u1' }).userId).toBe('u1')
  })

  it('idParam coerces and requires positive integer', () => {
    expect(idParam.parse({ id: '42' }).id).toBe(42)
    expect(() => idParam.parse({ id: '0' })).toThrow()
  })

  it('jobIdParam requires non-empty jobId', () => {
    expect(jobIdParam.parse({ jobId: 'j-1' }).jobId).toBe('j-1')
  })

  it('renderIdParam requires positive integer', () => {
    expect(renderIdParam.parse({ renderId: '3' }).renderId).toBe(3)
  })
})

// ── Notification & Activity queries ──────────────────────────

describe('Query schemas', () => {
  it('notificationsQuery applies defaults', () => {
    const result = notificationsQuery.parse({})
    expect(result.limit).toBe(50)
    expect(result.unreadOnly).toBe('false')
  })

  it('activityQuery accepts optional type', () => {
    const result = activityQuery.parse({ type: 'login' })
    expect(result.type).toBe('login')
  })

  it('adminUsersQuery applies defaults', () => {
    const result = adminUsersQuery.parse({})
    expect(result.limit).toBe(100)
    expect(result.offset).toBe(0)
  })
})

// ── Jobs / Applications ──────────────────────────────────────

describe('Job/Application schemas', () => {
  it('applicationStatusBody requires status', () => {
    expect(() => applicationStatusBody.parse({})).toThrow()
    expect(applicationStatusBody.parse({ status: 'SELECTED' }).status).toBe('SELECTED')
  })

  it('matchEnqueueBody requires jobId', () => {
    expect(() => matchEnqueueBody.parse({})).toThrow()
    const ok = matchEnqueueBody.parse({ jobId: 'j1' })
    expect(ok.jobId).toBe('j1')
  })
})

// ── Resume ───────────────────────────────────────────────────

describe('Resume schemas', () => {
  it('resumeSaveBody applies defaults for empty input', () => {
    const result = resumeSaveBody.parse({})
    expect(result.summary).toBe('')
    expect(result.education).toEqual([])
    expect(result.skills).toEqual([])
  })

  it('resumeTemplateBody requires all fields', () => {
    expect(() => resumeTemplateBody.parse({})).toThrow()
    const ok = resumeTemplateBody.parse({ templateKey: 'tpl1', name: 'Modern', latexSource: '\\doc' })
    expect(ok.templateKey).toBe('tpl1')
  })

  it('resumeRenderBody requires templateId and resumeVersion', () => {
    expect(() => resumeRenderBody.parse({})).toThrow()
    const ok = resumeRenderBody.parse({ templateId: '1', resumeVersion: 'v1' })
    expect(ok.templateId).toBe(1)
  })
})

// ── Learning ─────────────────────────────────────────────────

describe('Learning schemas', () => {
  it('courseBody requires name and externalUrl', () => {
    expect(() => courseBody.parse({})).toThrow()
    const ok = courseBody.parse({ name: 'React', externalUrl: 'https://example.com' })
    expect(ok.name).toBe('React')
  })

  it('courseUpdateBody validates status enum', () => {
    expect(() => courseUpdateBody.parse({ status: 'INVALID' })).toThrow()
    const ok = courseUpdateBody.parse({ status: 'APPROVED' })
    expect(ok.status).toBe('APPROVED')
  })

  it('courseAdminQuery accepts valid status', () => {
    const result = courseAdminQuery.parse({ status: 'DRAFT' })
    expect(result.status).toBe('DRAFT')
  })

  it('courseAdminQuery accepts empty', () => {
    const result = courseAdminQuery.parse({})
    expect(result.status).toBeUndefined()
  })
})

// ── Attendance ───────────────────────────────────────────────

describe('Attendance schemas', () => {
  it('attendanceBody validates range', () => {
    expect(() => attendanceBody.parse({ attendance: -1 })).toThrow()
    expect(() => attendanceBody.parse({ attendance: 101 })).toThrow()
    expect(attendanceBody.parse({ attendance: '75' }).attendance).toBe(75)
  })
})
