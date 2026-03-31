/**
 * Custom React hooks for API data fetching using TanStack React Query.
 * Provides type-safe, cache-aware data access for all domains.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import { queryKeys } from '../lib/queryClient'

// ── Academics ───────────────────────────────────────────────────

export function useAcademics(userId) {
  return useQuery({
    queryKey: queryKeys.academics(userId),
    queryFn: () => api.get(`/api/academics/${userId}`),
    enabled: !!userId,
  })
}

export function useAddSubject(userId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post(`/api/academics/${userId}/academics`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.academics(userId) }),
  })
}

// ── Assignments ─────────────────────────────────────────────────

export function useAssignments(userId) {
  return useQuery({
    queryKey: queryKeys.assignments(userId),
    queryFn: () => api.get(`/api/tasks/${userId}/assignments`),
    enabled: !!userId,
  })
}

export function useCreateAssignment(userId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post(`/api/tasks/${userId}/assignments`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assignments(userId) }),
  })
}

export function useUpdateAssignment(userId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/api/tasks/${userId}/assignments/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assignments(userId) }),
  })
}

export function useDeleteAssignment(userId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/api/tasks/${userId}/assignments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assignments(userId) }),
  })
}

// ── Exams ───────────────────────────────────────────────────────

export function useExams(userId) {
  return useQuery({
    queryKey: queryKeys.exams(userId),
    queryFn: () => api.get(`/api/tasks/${userId}/exams`),
    enabled: !!userId,
  })
}

export function useCreateExam(userId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post(`/api/tasks/${userId}/exams`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exams(userId) }),
  })
}

export function useDeleteExam(userId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/api/tasks/${userId}/exams/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exams(userId) }),
  })
}

// ── Jobs ────────────────────────────────────────────────────────

export function useJobs(filters = {}) {
  return useQuery({
    queryKey: queryKeys.jobs(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
      const qs = params.toString()
      return api.get(`/api/jobs${qs ? `?${qs}` : ''}`)
    },
  })
}

export function useJob(id) {
  return useQuery({
    queryKey: queryKeys.job(id),
    queryFn: () => api.get(`/api/jobs/${id}`),
    enabled: !!id,
  })
}

export function useSaveJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/api/jobs/${id}/save`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

export function useUnsaveJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/api/jobs/${id}/save`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

// ── Job Statuses ────────────────────────────────────────────────

export function useJobStatuses(opts = {}) {
  return useQuery({
    queryKey: queryKeys.jobStatuses(),
    queryFn: () => api.get('/api/jobs/me/status'),
    refetchInterval: 10_000, // Poll every 10s for pipeline updates
    ...opts,
  })
}

// ── Applications ────────────────────────────────────────────────

export function useApplications() {
  return useQuery({
    queryKey: queryKeys.applications(),
    queryFn: () => api.get('/api/applications/me'),
  })
}

export function useCreateApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/api/applications', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.applications() })
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

// ── Skills ──────────────────────────────────────────────────────

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills(),
    queryFn: () => api.get('/api/skills/me'),
  })
}

export function useMatchingRoles() {
  return useQuery({
    queryKey: ['matching', 'roles'],
    queryFn: () => api.get('/api/matching/roles/list'),
  })
}

export function useSkillGapAnalysis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post(`/api/skills/${body.userId}/skill-gaps`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skillGaps() }),
  })
}

// ── Learning ────────────────────────────────────────────────────

export function useLearningResources(filters = {}) {
  return useQuery({
    queryKey: queryKeys.learningResources(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
      const qs = params.toString()
      return api.get(`/api/learning/resources${qs ? `?${qs}` : ''}`)
    },
  })
}

export function useLearningCourses() {
  return useQuery({
    queryKey: ['learning', 'courses'],
    queryFn: () => api.get('/api/learning/courses'),
  })
}

export function useCompleteCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (courseId) => api.post(`/api/learning/courses/${courseId}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['learning'] }),
  })
}

// ── Admin ───────────────────────────────────────────────────────

export function useAdminUsers(filters = {}) {
  return useQuery({
    queryKey: queryKeys.adminUsers(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => { if (v !== undefined) params.set(k, v) })
      const qs = params.toString()
      return api.get(`/api/admin/users${qs ? `?${qs}` : ''}`)
    },
  })
}

export function useAdminApplications(filters = {}) {
  return useQuery({
    queryKey: queryKeys.adminApplications(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
      const qs = params.toString()
      return api.get(`/api/applications/admin${qs ? `?${qs}` : ''}`)
    },
  })
}

export function useUpdateApplicationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }) => api.patch(`/api/applications/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'applications'] }),
  })
}

export function useAdminCourses(filters = {}) {
  return useQuery({
    queryKey: queryKeys.adminCourses(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
      const qs = params.toString()
      return api.get(`/api/learning/courses/admin${qs ? `?${qs}` : ''}`)
    },
  })
}

export function useCreateCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/api/learning/courses', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'courses'] }),
  })
}

// ── Resume ──────────────────────────────────────────────────────

export function useResume(userId) {
  return useQuery({
    queryKey: queryKeys.resume(),
    queryFn: () => api.get(`/api/resume/${userId}`),
    enabled: !!userId,
  })
}

export function useSaveResume(userId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post(`/api/resume/${userId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.resume() })
      qc.invalidateQueries({ queryKey: queryKeys.resumeAnalysis() })
    },
  })
}

export function useResumeAnalysis(userId) {
  return useQuery({
    queryKey: queryKeys.resumeAnalysis(),
    queryFn: () => api.post(`/api/resume/${userId}/analyze`),
    enabled: !!userId,
  })
}

// ── Notifications ───────────────────────────────────────────────

export function useNotifications(opts = {}) {
  return useQuery({
    queryKey: queryKeys.notifications(),
    queryFn: () => api.get('/api/notifications/me'),
    ...opts,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.patch(`/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications() }),
  })
}

// ── Profile ─────────────────────────────────────────────────────

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile(),
    queryFn: () => api.get('/api/profile/me'),
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/api/profile/me', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.profile() }),
  })
}

// ── Match Results ───────────────────────────────────────────────

export function useMatchResults(resumeVersion) {
  return useQuery({
    queryKey: [...queryKeys.matchResults(), resumeVersion],
    queryFn: () => api.get(`/api/matching/me/results${resumeVersion ? `?resumeVersion=${resumeVersion}` : ''}`),
    enabled: !!resumeVersion,
  })
}

// ── Activity ────────────────────────────────────────────────────

export function useActivity() {
  return useQuery({
    queryKey: queryKeys.activity(),
    queryFn: () => api.get('/api/activity/me'),
  })
}

// ── Roadmaps ────────────────────────────────────────────────────

export function useRoadmapCompanies() {
  return useQuery({
    queryKey: ['roadmaps', 'companies'],
    queryFn: () => api.get('/api/roadmaps/companies'),
  })
}

export function useRoadmapRoles() {
  return useQuery({
    queryKey: ['roadmaps', 'roles'],
    queryFn: () => api.get('/api/roadmaps/roles'),
  })
}

export function useRoadmap(company, role) {
  return useQuery({
    queryKey: ['roadmaps', company, role],
    queryFn: () => api.get(`/api/roadmaps/${company}/${role}`),
    enabled: !!company && !!role,
  })
}
