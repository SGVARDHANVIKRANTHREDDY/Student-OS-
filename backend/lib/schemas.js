/**
 * Shared Zod schemas for common request patterns.
 * Re-exported by individual route validation modules as needed.
 */
import { z } from 'zod'

// ── Primitives ──────────────────────────────────────────────────

export const trimmedString = z.string().trim()
export const nonEmptyString = z.string().trim().min(1)
// Email validation: allows both standard emails and local/dev patterns
export const email = z.string().trim().toLowerCase()
  .regex(/^[^\s@]+@[^\s@]+$/, { message: 'Invalid email format' })
export const uuid = z.string().uuid()
export const positiveInt = z.coerce.number().int().positive()
export const nonNegativeInt = z.coerce.number().int().min(0)

// ── Pagination ──────────────────────────────────────────────────

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

export const cursorPaginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

// ── Auth ────────────────────────────────────────────────────────

export const loginBody = z.object({
  email: email,
  password: z.string().min(1, 'Password is required'),
})

export const signupBody = z.object({
  name: nonEmptyString.min(1, 'Full name is required'),
  email: email,
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

// ── Profile ─────────────────────────────────────────────────────

export const profileBody = z.object({
  college: trimmedString.optional(),
  branch: trimmedString.optional(),
  graduationYear: trimmedString.optional(),
  careerGoal: trimmedString.optional(),
  onboarded: z.boolean().optional(),
})

// ── Academics ───────────────────────────────────────────────────

export const subjectBody = z.object({
  subject: nonEmptyString,
  score: z.coerce.number().min(0).max(100),
  grade: trimmedString.default('N/A'),
})

// ── Assignments / Tasks ─────────────────────────────────────────

export const assignmentBody = z.object({
  title: nonEmptyString,
  dueDate: nonEmptyString,
  status: trimmedString.default('pending'),
  description: trimmedString.optional().default(''),
})

export const examBody = z.object({
  subject: nonEmptyString,
  date: nonEmptyString,
  time: trimmedString.default('10:00 AM'),
})

// ── ID Params ───────────────────────────────────────────────────

export const userIdParam = z.object({
  userId: nonEmptyString,
})

export const idParam = z.object({
  id: positiveInt,
})

export const idStringParam = z.object({
  id: nonEmptyString,
})

export const userIdAndIdParam = z.object({
  userId: nonEmptyString,
  id: positiveInt,
})

// ── Notifications ───────────────────────────────────────────────

export const notificationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  beforeId: z.coerce.number().int().positive().optional(),
  unreadOnly: z.enum(['true', 'false']).default('false'),
})

// ── Activity ────────────────────────────────────────────────────

export const activityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  beforeId: z.coerce.number().int().positive().optional(),
  type: trimmedString.optional(),
})

// ── Attendance ──────────────────────────────────────────────────

export const attendanceBody = z.object({
  attendance: z.coerce.number().min(0).max(100),
})

export const attendanceRecordBody = z.object({
  day: nonEmptyString,
  status: z.enum(['PRESENT', 'ABSENT', 'present', 'absent']).transform((v) => v.toUpperCase()),
})

export const careerGoalBody = z.object({
  goal: nonEmptyString,
})

// ── Google Auth ─────────────────────────────────────────────────

export const googleAuthBody = z.object({
  credential: nonEmptyString,
})

// ── Jobs ────────────────────────────────────────────────────────

export const jobStatusQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  type: trimmedString.optional(),
})

export const jobIdParam = z.object({
  jobId: nonEmptyString,
})

// ── Applications ────────────────────────────────────────────────

export const applicationStatusBody = z.object({
  status: nonEmptyString,
})

// ── Postings ────────────────────────────────────────────────────

export const postingReviewBody = z.object({
  decision: nonEmptyString,
  reason: trimmedString.optional(),
})

export const postingListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: trimmedString.optional(),
})

// ── Resume ──────────────────────────────────────────────────────

export const resumeSaveBody = z.object({
  summary: trimmedString.optional().default(''),
  education: z.array(z.any()).optional().default([]),
  skills: z.array(z.any()).optional().default([]),
  projects: z.array(z.any()).optional().default([]),
  experience: z.array(z.any()).optional().default([]),
})

export const resumeTemplateBody = z.object({
  templateKey: nonEmptyString,
  name: nonEmptyString,
  latexSource: nonEmptyString,
})

export const resumeRenderBody = z.object({
  templateId: positiveInt,
  resumeVersion: nonEmptyString,
})

export const renderIdParam = z.object({
  renderId: positiveInt,
})

export const resumeVersionQuery = z.object({
  resumeVersion: trimmedString.optional(),
  includeSnapshot: z.enum(['true', 'false']).optional(),
})

// ── Matching ────────────────────────────────────────────────────

export const matchEnqueueBody = z.object({
  jobId: nonEmptyString,
  resumeVersion: trimmedString.optional(),
})

export const matchRequestBody = z.object({
  jobDescription: trimmedString.optional(),
  roleId: trimmedString.optional(),
  resume: z.object({
    skills: z.array(z.string()).optional(),
  }).optional(),
})

// ── Admin ───────────────────────────────────────────────────────

export const adminUsersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

// ── Learning ────────────────────────────────────────────────────

export const courseBody = z.object({
  name: nonEmptyString,
  description: trimmedString.optional(),
  imageUrl: trimmedString.optional(),
  externalUrl: nonEmptyString,
  skills: z.array(z.string()).optional(),
})

export const courseUpdateBody = z.object({
  name: trimmedString.optional(),
  description: trimmedString.optional(),
  imageUrl: trimmedString.optional(),
  externalUrl: trimmedString.optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'ARCHIVED']).optional(),
  skills: z.array(z.string()).optional(),
})

export const courseAdminQuery = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'ARCHIVED']).optional(),
})

export const learningPlanItemStatusBody = z.object({
  status: z.enum(['not_started', 'in_progress', 'completed', 'skipped']),
})
