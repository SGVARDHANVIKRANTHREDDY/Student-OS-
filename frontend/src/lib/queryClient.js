import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,             // 30s before data is considered stale
      gcTime: 5 * 60_000,            // 5m garbage collection
      retry: 1,                      // One retry on transient failure
      refetchOnWindowFocus: true,    // Refetch on tab switch
      refetchOnReconnect: true,      // Refetch on network reconnect
    },
    mutations: {
      retry: 0,
    },
  },
})

// ── Query key factories ─────────────────────────────────────────
// Structured key factories enable precise cache invalidation.
// Pattern: [domain, scope?, ...params]

export const queryKeys = {
  // Auth & profile
  me: () => ['me'],
  profile: () => ['profile'],

  // Academics
  academics: (userId) => ['academics', userId],

  // Tasks & assignments
  assignments: (userId) => ['assignments', userId],
  exams: (userId) => ['exams', userId],

  // Resume
  resume: () => ['resume'],
  resumeAnalysis: () => ['resume', 'analysis'],
  resumeRenders: () => ['resume', 'renders'],

  // Jobs & marketplace
  jobs: (filters) => ['jobs', filters],
  job: (id) => ['job', id],
  jobStatuses: () => ['job-statuses'],

  // Applications
  applications: () => ['applications'],

  // Skills
  skills: () => ['skills'],
  skillGaps: () => ['skill-gaps'],

  // Learning
  learningResources: (filters) => ['learning-resources', filters],
  learningCourses: () => ['learning', 'courses'],
  learningPlans: () => ['learning-plans'],

  // Matching
  matchResults: () => ['match-results'],

  // Notifications
  notifications: () => ['notifications'],
  unreadCount: () => ['notifications', 'unread-count'],

  // Admin
  adminUsers: (filters) => ['admin', 'users', filters],
  adminApplications: (filters) => ['admin', 'applications', filters],
  adminCourses: (filters) => ['admin', 'courses', filters],

  // Activity
  activity: () => ['activity'],

  // Roadmaps
  roadmaps: () => ['roadmaps'],
}
