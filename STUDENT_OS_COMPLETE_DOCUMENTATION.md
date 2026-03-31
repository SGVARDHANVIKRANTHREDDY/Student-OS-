# Student OS — Complete Engineering Documentation

> **Generated:** 2026-03-10 | **Scope:** Full codebase documentation pass for onboarding engineers

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Full Repository Structure](#2-full-repository-structure)
3. [Technology Stack](#3-technology-stack)
4. [Backend Architecture](#4-backend-architecture)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Database Design](#6-database-design)
7. [Authentication Flow](#7-authentication-flow)
8. [API Endpoints](#8-api-endpoints)
9. [Middleware System](#9-middleware-system)
10. [Testing Architecture](#10-testing-architecture)
11. [Environment Variables](#11-environment-variables)
12. [Known Risks and Technical Debt](#12-known-risks-and-technical-debt)
13. [System Data Flow](#13-system-data-flow)

---

## 1. Project Overview

### Purpose

**Student OS** is a unified, full-stack career-development operating system built for university students. It centralises every dimension of a student's academic and professional journey into one coherent platform:

* **Academic tracking** – subjects, scores, grades, attendance, exams, assignments
* **Resume builder** – structured form-based creation, PDF uploads, version history, and LaTeX-based rendering
* **AI-powered job matching** – skill-gap analysis between a student's parsed resume and job descriptions
* **Learning plans** – auto-generated, personalised study plans based on skill-gap data
* **Job marketplace** – browse listings, view details, apply, and track applications
* **Career roadmaps** – visual, curated pathways toward specific roles
* **Skill management** – user skill profiles, gap visualisation, and improvement suggestions
* **Admin panel** – platform admin, job/course/user management

### Core Product Concept

The platform follows a **Resume → Matching → Learning Loop** paradigm:

1. A student builds or uploads a resume.
2. The system matches it against job descriptions and scores compatibility.
3. Missing skills are identified and a personalised learning plan is generated.
4. As the student completes courses, the cycle refreshes.

### Multi-tenancy Model

Student OS is built with multi-tenancy from the ground up. A **tenant** represents an organisational boundary (individual student, college, recruiter, or platform operator). Every resource is scoped to a tenant, enabling future SaaS deployments where colleges or recruiters get isolated instances.

---

## 2. Full Repository Structure

```
student-os/
├── .github/
│   └── workflows/
│       └── ci.yml                    # GitHub Actions CI pipeline
├── .gitignore
├── .vscode/                          # Editor settings
├── backend/                          # Node.js/Express API server
│   ├── .env                          # Local env (not committed)
│   ├── .env.example                  # Env variable template
│   ├── data/                         # SQLite database file (auto-created)
│   ├── domain/                       # Domain model objects
│   │   ├── application.js            # Application domain entity
│   │   ├── job.js                    # Job domain entity
│   │   └── serviceErrors.js          # Domain-level error classes
│   ├── lib/                          # Shared utilities and DALs
│   │   ├── accountLifecycle.js       # Account lifecycle helpers
│   │   ├── activityDal.js            # Activity event data-access layer
│   │   ├── activityTypes.js          # Activity type constants
│   │   ├── apiResponse.js            # Standardised HTTP response helpers
│   │   ├── auditDal.js               # Audit log data-access layer
│   │   ├── billing.js                # Entitlement/quota checks
│   │   ├── bruteForce.js             # Redis-backed brute force guard
│   │   ├── correlationId.js          # Request correlation ID middleware
│   │   ├── db.js                     # SQLite database initialiser (better-sqlite3)
│   │   ├── envValidation.js          # Startup env var validation
│   │   ├── jobPayloads.js            # BullMQ job payload builders
│   │   ├── jobsDal.js                # Jobs data-access layer (PG)
│   │   ├── jobStatusDal.js           # Job status snapshot DAL
│   │   ├── learningPlanEngine.js     # Learning plan generation logic
│   │   ├── learningResourcesDal.js   # Learning resources DAL
│   │   ├── logger.js                 # Pino structured logger + HTTP logger
│   │   ├── matchingEngine.js         # Resume-to-job matching algorithm
│   │   ├── metrics.js                # In-process counters + histograms
│   │   ├── migrate.js                # SQLite migration runner
│   │   ├── multerHashStorage.js      # Multer file upload with content hashing
│   │   ├── notificationsDal.js       # Notifications data-access layer
│   │   ├── pg.js                     # PostgreSQL connection pool manager
│   │   ├── pgMigrate.js              # PostgreSQL migration runner
│   │   ├── postingsDal.js            # Job postings data-access layer (PG)
│   │   ├── publicErrors.js           # Public-facing error definitions
│   │   ├── queues.js                 # BullMQ queue factory + quota checks
│   │   ├── rbac.js                   # Role-based access control helpers
│   │   ├── redis.js                  # ioredis connection manager
│   │   ├── requestTiming.js          # Request duration middleware
│   │   ├── resumeDomain.js           # Resume domain logic
│   │   ├── schemas.js                # Shared Zod validation schemas
│   │   ├── tenancy.js                # Tenant context helpers
│   │   ├── tenantScope.js            # Tenant scope enforcement
│   │   ├── userSkillsDal.js          # User skills DAL
│   │   └── validate.js               # Zod middleware wrapper
│   ├── middleware/
│   │   ├── auth.js                   # JWT auth middleware (sets req.user + req.auth)
│   │   └── redisRateLimit.js         # Redis-backed rate limiter
│   ├── migrations/                   # SQLite migration SQL files (run in order)
│   │   ├── 001_init.sql              # Core tables: users, profiles, academics, resumes
│   │   ├── 002_refresh_tokens.sql    # Refresh token storage
│   │   ├── 003_user_role.sql         # User role field
│   │   ├── 004_resume_domain.sql     # Resume versioning + matching + learning plans
│   │   ├── 005_trust_operability.sql # Activity events, notifications, audit logs, job status
│   │   ├── 006_multitenancy_rbac.sql # Tenants, roles, permissions, assignments
│   │   ├── 007_billing_scaffolding.sql # Entitlements + quota tables
│   │   ├── 008_backfill_tenant_ids.sql # Backfill tenant IDs post-migration
│   │   ├── 009_account_lifecycle.sql # Account soft-delete + status fields
│   │   ├── 010_quota_entitlements.sql # Quota enforcement columns
│   │   ├── 011_governance_upgrade.sql # Skills, user skills, roadmaps, tasks
│   │   └── 012_account_access_model.sql # deleted_at, access control refinements
│   ├── pg-migrations/                # PostgreSQL migration SQL files
│   │   ├── 001_jobs_init.sql         # jobs, skills, companies tables
│   │   ├── 002_jobs_admin_fields.sql # Admin-managed job fields
│   │   ├── 003_tenant_default.sql    # Default tenant seeding for PG
│   │   ├── 004_job_postings.sql      # Job postings workflow table
│   │   ├── 005_cursor_search_ranking.sql # Full-text search + cursor ranking
│   │   ├── 006_learning_resources.sql    # Courses + learning resources
│   │   ├── 007_applications_selected.sql # Application status field
│   │   └── 008_marketplace_job_lifecycle.sql # Job lifecycle states
│   ├── repositories/
│   │   ├── applicationsRepository.js # Applications data access (PG)
│   │   └── jobsRepository.js         # Jobs data access (PG)
│   ├── routes/                       # Express route handlers
│   │   ├── academics.js              # Academic subjects, attendance, exams, assignments
│   │   ├── account.js                # Account self-management + deletion
│   │   ├── activity.js               # User activity event feed
│   │   ├── admin.js                  # Platform admin routes
│   │   ├── applications.js           # Job applications (student + admin)
│   │   ├── auth.js                   # Signup, login, Google SSO, refresh, logout
│   │   ├── jobs.js                   # Job listings, details, status
│   │   ├── learning.js               # Courses, learning plans, enrolment
│   │   ├── matching.js               # Resume-to-job matching endpoints
│   │   ├── notifications.js          # Notification inbox
│   │   ├── postings.js               # Job posting workflow (Recruiter → Admin review)
│   │   ├── profile.js                # Student profile CRUD + onboarding
│   │   ├── resume.js                 # Resume CRUD, file upload, rendering
│   │   ├── roadmaps.js               # Career roadmaps
│   │   ├── skills.js                 # Skills catalogue + user skill profiles
│   │   └── tasks.js                  # Task/to-do management
│   ├── scripts/
│   │   ├── migrate-pg.js             # CLI script: run PG migrations
│   │   └── promote-admin.js          # CLI script: promote user to admin
│   ├── services/
│   │   ├── applicationService.js     # Application business logic
│   │   ├── capabilities.js           # Feature capability checks
│   │   ├── courseService.js          # Course business logic
│   │   └── jobService.js             # Job business logic + enrichment
│   ├── tests/
│   │   ├── integration/
│   │   │   └── api.test.js           # Integration tests (supertest)
│   │   ├── unit/
│   │   │   ├── apiResponse.test.js   # Unit: response helpers
│   │   │   ├── correlationId.test.js # Unit: correlation ID middleware
│   │   │   ├── metrics.test.js       # Unit: metrics module
│   │   │   ├── requestTiming.test.js # Unit: request timing middleware
│   │   │   ├── schemas.test.js       # Unit: Zod schema validation
│   │   │   └── validate.test.js      # Unit: validate middleware
│   │   └── testApp.js                # Minimal Express app for integration tests
│   ├── workers/                      # BullMQ background job processors
│   │   ├── learningPlanGeneration.js # Worker: generate learning plans
│   │   ├── resumeMatching.js         # Worker: run resume matching algorithm
│   │   ├── resumeProcessing.js       # Worker: parse uploaded PDF resumes
│   │   └── resumeRendering.js        # Worker: render resumes to PDF via LaTeX
│   ├── server.js                     # Main Express server entry point
│   ├── worker.js                     # BullMQ worker process entry point
│   ├── vitest.config.js              # Vitest test runner configuration
│   └── package.json
├── frontend/                         # React SPA (Vite)
│   ├── .env.example
│   ├── index.html                    # Vite HTML entry
│   ├── vite.config.js                # Vite build configuration
│   ├── public/                       # Static assets
│   ├── src/
│   │   ├── main.jsx                  # React app mount point
│   │   ├── App.jsx                   # Root router + lazy page loading
│   │   ├── index.css                 # Global CSS variables + base styles
│   │   ├── context/
│   │   │   └── AuthContext.jsx       # Auth state provider (token, user, profile, auth)
│   │   ├── components/               # Shared UI components
│   │   │   ├── AppShell.jsx/css      # Sidebar nav + layout shell for authenticated pages
│   │   │   ├── PrivateRoute.jsx      # Route guard (requires login + optionally onboarding)
│   │   │   ├── RequirePermission.jsx # Route guard (requires specific RBAC permissions)
│   │   │   ├── JobMatcher.jsx/css    # Resume-to-job matching UI
│   │   │   ├── LearningPlatform.jsx/css # Course browser + learning plan UI
│   │   │   ├── ResumeForm.jsx/css    # Resume editor form
│   │   │   ├── ResumeAnalysis.jsx/css # Resume analysis results
│   │   │   ├── ResumePreview.jsx/css # Resume preview panel
│   │   │   ├── SkillGapTranslator.jsx/css # Skill gap visualisation
│   │   │   ├── AcademicsSection.jsx/css   # Academics dashboard section
│   │   │   ├── TasksSection.jsx/css       # Tasks dashboard section
│   │   │   ├── StatusCards.jsx/css        # Summary stat cards
│   │   │   ├── Toast.jsx/css              # Toast notifications
│   │   │   ├── ErrorBoundary.jsx/css      # Error boundary wrapper
│   │   │   ├── ConfirmDialog.jsx/css      # Confirmation modal
│   │   │   ├── EmptyState.jsx/css         # Empty state placeholder
│   │   │   ├── GoogleSignInButton.jsx     # Google OAuth button
│   │   │   └── Spinner.jsx/css            # Loading spinner
│   │   ├── hooks/
│   │   │   ├── useApi.js             # React Query data fetching hooks for all domains
│   │   │   └── useUtils.js           # Utility hooks (toast, confirm dialog, etc.)
│   │   ├── lib/
│   │   │   ├── api.js                # Legacy apiFetch wrapper (thin shim)
│   │   │   ├── apiClient.js          # Core fetch wrapper with auto token refresh
│   │   │   ├── authz.js              # Frontend RBAC permission helpers
│   │   │   └── queryClient.js        # React Query client configuration
│   │   ├── pages/                    # Page-level components (lazy loaded)
│   │   │   ├── Landing.jsx/css       # Public landing page
│   │   │   ├── Login.jsx/css         # Student login page
│   │   │   ├── AdminLogin.jsx        # Admin login page
│   │   │   ├── Signup.jsx            # Registration page
│   │   │   ├── Onboarding.jsx/css    # First-time profile setup
│   │   │   ├── Dashboard.jsx/css     # Main authenticated home
│   │   │   ├── Academics.jsx         # Academic records page
│   │   │   ├── Skills.jsx/css        # Skills management page
│   │   │   ├── Tasks.jsx             # Tasks page
│   │   │   ├── Roadmaps.jsx/css      # Career roadmaps page
│   │   │   ├── Resume.jsx/css        # Resume management page
│   │   │   ├── Jobs.jsx/css          # Job listings page
│   │   │   ├── JobDetails.jsx/css    # Individual job detail + apply page
│   │   │   ├── Applications.jsx/css  # Student's application history
│   │   │   ├── Learning.jsx/css      # Learning resources page
│   │   │   ├── AdminUsers.jsx        # Admin: user management
│   │   │   ├── AdminApplications.jsx # Admin: application management
│   │   │   └── AdminCourses.jsx      # Admin: course management
│   │   └── test/                     # Frontend unit tests
│   └── package.json
├── scripts/                          # PowerShell dev utility scripts
│   ├── smoke-auth.ps1                # Auth smoke test
│   ├── smoke-data.ps1                # Data smoke test
│   ├── smoke-marketplace.ps1         # Marketplace smoke test
│   ├── start-backend-dev.ps1         # Start backend dev server
│   ├── start-frontend-dev.ps1        # Start frontend dev server
│   ├── start-worker-dev.ps1          # Start BullMQ worker
│   └── test-login-onboarding.ps1     # Login + onboarding flow test
├── tools/
│   ├── check-backend.mjs             # Backend dependency health checker
│   └── generate-requirements.mjs    # Requirements.txt generator
├── docker-compose.yml                # Docker: PostgreSQL + Redis services
├── RUNSTUDENTOS.py                   # Cross-platform launcher script
├── RUNSTUDENTOS.bat                  # Windows batch launcher
├── RUNSTUDENTOS.ps1                  # PowerShell launcher
├── README.md
└── requirements.txt                  # Python deps (for launcher tooling)
```

---

## 3. Technology Stack

### Backend

| Layer | Technology | Version |
|---|---|---|
| **Runtime** | Node.js | 20 (LTS) |
| **Framework** | Express.js | ^4.18 |
| **Primary DB** | SQLite via `better-sqlite3` | ^8.7 |
| **Secondary DB** | PostgreSQL via `pg` | ^8.16 |
| **Cache / Queue** | Redis via `ioredis` | ^5.8 |
| **Job Queue** | BullMQ | ^5.58 |
| **Authentication** | JWT (`jsonwebtoken`) + bcryptjs | ^9.0 / ^3.0 |
| **Google SSO** | `google-auth-library` | ^10.5 |
| **Validation** | Zod | ^4.3 |
| **Logging** | Pino + pino-http | ^9.7 / ^10.5 |
| **Security** | Helmet, HPP, express-rate-limit | latest |
| **File Uploads** | Multer | ^2.0 |
| **PDF Parsing** | pdf-parse | ^1.1 |
| **Testing** | Vitest + Supertest | ^4.0 / ^7.2 |
| **Coverage** | @vitest/coverage-v8 | ^4.0 |

### Frontend

| Layer | Technology | Version |
|---|---|---|
| **Framework** | React | ^18.2 |
| **Build Tool** | Vite | ^5.4 |
| **Routing** | React Router DOM | ^6.20 |
| **Data Fetching** | TanStack React Query | ^5.90 |
| **HTTP Client** | Native `fetch` (wrapped in `apiClient.js`) | — |
| **Testing** | Vitest + @testing-library/react | ^4.0 / ^16.3 |
| **Test DOM** | jsdom | ^28.1 |
| **Styling** | Vanilla CSS with CSS custom properties | — |

### Infrastructure / DevOps

| Tool | Purpose |
|---|---|
| **Docker Compose** | Local PostgreSQL 16 + Redis 7 services |
| **GitHub Actions** | CI pipeline (tests + coverage + build) |
| **PowerShell scripts** | Developer utility scripts (smoke tests, starters) |
| **Python launcher** | Cross-platform `RUNSTUDENTOS.py` starter |

---

## 4. Backend Architecture

### 4.1 Server Entry Point (`server.js`)

`server.js` is the sole backend entry point. On startup it:

1. Loads `.env` via `dotenv` and validates required vars via `validateEnv()`.
2. Generates a random ephemeral `JWT_SECRET` in dev if not set.
3. Eagerly initialises SQLite (`getDb()`) and runs all pending migrations — process exits if this fails.
4. Conditionally connects to PostgreSQL and runs PG migrations (non-fatal in dev; fatal in production or if `PG_MIGRATIONS_STRICT=true`).
5. Builds the Express app with a strict middleware pipeline.
6. Mounts all route groups under `/api/`.
7. Exposes observability endpoints (`/api/health`, `/api/ready`, `/api/metrics`).
8. Registers the global error handler.
9. Listens on `PORT` (default `5000`) and `HOST` (default `127.0.0.1` in dev, `0.0.0.0` in prod).
10. Handles `SIGINT`/`SIGTERM` for graceful shutdown (closes DB, PG pool, Redis, BullMQ queues).

### 4.2 Routing Layer

All routes are mounted in `server.js` under the `/api` prefix:

| Mount Path | File |
|---|---|
| `/api/auth` | `routes/auth.js` |
| `/api/academics` | `routes/academics.js` |
| `/api/tasks` | `routes/tasks.js` |
| `/api/resume` | `routes/resume.js` |
| `/api/matching` | `routes/matching.js` |
| `/api/skills` | `routes/skills.js` |
| `/api/learning` | `routes/learning.js` |
| `/api/roadmaps` | `routes/roadmaps.js` |
| `/api/profile` | `routes/profile.js` |
| `/api/jobs` | `routes/jobs.js` |
| `/api/applications` | `routes/applications.js` |
| `/api/admin` | `routes/admin.js` |
| `/api/postings` | `routes/postings.js` |
| `/api/activity` | `routes/activity.js` |
| `/api/notifications` | `routes/notifications.js` |
| `/api/account` | `routes/account.js` |

### 4.3 Controllers

Student OS uses a **flat route-handler pattern** — there is no separate controller layer. Each `routes/*.js` file both defines routes and handles business logic inline, calling DAL functions from `lib/` and service functions from `services/`. This keeps the codebase simple at the cost of some separation of concerns.

### 4.4 Services Layer (`services/`)

Four service modules encapsulate complex, reusable business logic:

| File | Responsibility |
|---|---|
| `applicationService.js` | Creates and manages job applications; checks for duplicate applications; updates status lifecycle; records audit trails |
| `jobService.js` | Fetches, enriches, and caches job listings; resolves skill associations; handles admin-level job creation and lifecycle |
| `courseService.js` | Course creation and retrieval helpers |
| `capabilities.js` | Feature flag / plan capability checks |

### 4.5 Middleware Pipeline

The middleware is applied in this strict order in `server.js`:

```
1. correlationId()        — Attaches/generates X-Correlation-Id on every request
2. requestTiming()        — Records request start time for latency metrics
3. httpLogger             — Pino structured HTTP request logging
4. helmet()               — Sets secure HTTP headers
5. hpp()                  — Prevents HTTP parameter pollution
6. cors()                 — CORS (only if CORS_ORIGIN is set)
7. express.json()         — JSON body parser (limit: 1mb by default)
8. express.urlencoded()   — URL-encoded body parser
9. cookieParser()         — Cookie parsing (for refresh_token cookie)
10. metrics counter       — Increments http_requests_total counter on finish
11. rateLimit()           — 600 req/min baseline limit on /api/*
```

Auth routes additionally apply a tighter rate limit of **30 req / 15 min** via `authLimiter`.

### 4.6 Authentication Middleware (`middleware/auth.js`)

`authMiddleware` is a standard Express middleware applied to all protected routes:

1. Extracts the `Bearer` token from the `Authorization` header.
2. Verifies and decodes the JWT using `process.env.JWT_SECRET`.
3. Populates `req.user` with the decoded JWT payload.
4. Looks up the user's current `status` in SQLite to enforce soft-deletes.
5. Resolves RBAC roles and permissions (from JWT claims first; falls back to DB).
6. Populates `req.auth` with `{ userId, tenantId, roles, permissions, status }`.
7. Returns `403 ACCOUNT_INACTIVE` if the account is not `ACTIVE` (except for the DELETE /api/account/me endpoint).
8. Enforces cross-user access rules using the resolved permissions.

### 4.7 Validation System (`lib/validate.js` + `lib/schemas.js`)

**`validate.js`**: A thin Zod middleware factory. Usage:
```js
router.post('/signup', validate({ body: signupBody }), handler)
```
It validates `req.body`, `req.query`, or `req.params` against a Zod schema. On failure it returns `400` with structured `{ message, errors }`.

**`schemas.js`**: Centralised library of Zod schemas covering:
- Auth: `loginBody`, `signupBody`, `googleAuthBody`
- Profile: `profileBody`
- Academics: `subjectBody`, `assignmentBody`, `examBody`, `attendanceBody`
- Resume: `resumeSaveBody`, `resumeRenderBody`, `resumeTemplateBody`
- Jobs: `jobStatusQuery`, `jobIdParam`
- Applications: `applicationStatusBody`
- Admin: `adminUsersQuery`, `courseBody`, `courseUpdateBody`
- Pagination: `paginationQuery`, `cursorPaginationQuery`
- And many more.

### 4.8 Error Handling

The global error handler in `server.js` intercepts all errors:

| Error Type | Detection | HTTP Status | Response |
|---|---|---|---|
| `ServiceError` (domain) | `err.name === 'ServiceError'` | `err.httpStatus` | `err.toResponseBody()` |
| Malformed JSON | `err.type === 'entity.parse.failed'` | `400` | `{ message: 'Malformed JSON...' }` |
| Body too large | `err.type === 'entity.too.large'` | `413` | `{ message: 'Request body too large' }` |
| PG statement timeout | `err.code === '57014'` | `503` | `{ message: 'Query timed out...' }` |
| Unknown errors | catch-all | `500` | `{ message: 'Internal server error' }` |

Unhandled promise rejections and uncaught exceptions are both logged via `logger.error/fatal`.

### 4.9 Logging System (`lib/logger.js`)

Uses **Pino** (fast, structured, JSON logging):
- Log level: `LOG_LEVEL` env var (defaults to `debug` in dev, `info` in production).
- `Authorization` and `cookie` headers are **redacted** automatically.
- `httpLogger` (pino-http) auto-logs every request with method, URL, status, and duration.
- Assigns/propagates `X-Correlation-Id` header for distributed tracing.

### 4.10 Health Checks and Metrics

**`GET /api/health`** — Liveness check. Returns `{ status: 'ok', version, uptimeSec, timestamp }`.

**`GET /api/ready`** — Readiness check. Calls `getDependencyHealth()` which pings SQLite, PostgreSQL (if configured), and Redis (if configured). Returns `200` if all configured dependencies are healthy, `503` otherwise.

**`GET /api/metrics`** — Returns `getMetricsSnapshot()`: in-process counters (e.g., `http_requests_total` by method and status) and histogram statistics (p50, p95, p99). Designed to be trivially swapped for Prometheus/OpenTelemetry.

### 4.11 Database Connection Logic

**SQLite (`lib/db.js`)**
- Uses `better-sqlite3` (synchronous API) — a single shared connection.
- Database file defaults to `backend/data/student-os.sqlite`.
- Can be overridden with `DB_PATH` env var.
- On first call `getDb()` runs all pending SQL migrations via `lib/migrate.js`.

**PostgreSQL (`lib/pg.js`)**
- Uses `pg` (node-postgres) with read/write pool separation.
- Configured via `PG_URL` / `PGHOST` env vars.
- Connection pooling: max 20 connections (configurable via `PGPOOL_MAX`).
- SSL auto-enabled in production; disabled by `PG_SSL=0`.
- Statement timeout: 10 seconds (configurable via `PG_STATEMENT_TIMEOUT_MS`).
- `isPgConfigured()` gates all PG-dependent code paths; PG is optional.

**Redis (`lib/redis.js`)**
- Uses `ioredis` for BullMQ queues, rate limiting, and brute-force guards.
- Configured via `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`.
- `isRedisConfigured()` gates all Redis-dependent code paths; Redis is optional.

### 4.12 Background Workers (`worker.js`, `workers/`)

A separate process (`worker.js`) runs BullMQ **Worker** processors to handle async tasks off the hot request path.

**Queue names and their worker files:**

| Queue | Worker | Purpose |
|---|---|---|
| `resume_processing` | `workers/resumeProcessing.js` | Parse uploaded PDF resumes with `pdf-parse` |
| `resume_matching` | `workers/resumeMatching.js` | Run matching algorithm against job descriptions |
| `learning_plan_generation` | `workers/learningPlanGeneration.js` | Generate personalised learning plans from skill gaps |
| `resume_rendering` | `workers/resumeRendering.js` | Render resumes to PDF via LaTeX templates |
| `dead_letter` | (logging only) | Captures permanently failed jobs for debugging |

Workers are run as a **separate process** (`npm run worker`) and must share the same Redis as the API server.

---

## 5. Frontend Architecture

### 5.1 Framework Structure

The frontend is a **React 18 single-page application** built with **Vite 5**. It uses:
- **React Router DOM v6** for client-side routing.
- **TanStack React Query v5** for server state fetching, caching, and invalidation.
- **Vanilla CSS** with CSS custom properties for theming.
- All pages are **lazy-loaded** via `React.lazy()` and wrapped in `<Suspense>` for automatic code splitting.

### 5.2 App Entry (`main.jsx` → `App.jsx`)

`main.jsx` mounts the React tree, wrapping the app in:
- `QueryClientProvider` (React Query)
- `AuthProvider` (auth context from `AuthContext.jsx`)

`App.jsx` is the root routing component. It:
1. Reads `{ ready, isAuthenticated }` from `useAuth()`.
2. Renders a full-screen `AppLoader` spinner until the auth context is `ready`.
3. Declares all routes using React Router's `<Routes>` / `<Route>`.

### 5.3 Routing

All routes in `App.jsx`:

| Path | Component | Guard |
|---|---|---|
| `/` | `Landing` | Public |
| `/student/login` | `Login` | Public |
| `/admin/login` | `AdminLogin` | Public |
| `/signup` | `Signup` | Public |
| `/onboarding` | `Onboarding` | `PrivateRoute` (login only) |
| `/app` (layout) | `AppShell` | `PrivateRoute` + `requireOnboarded` |
| `/app` (index) | `Dashboard` | Nested in `/app` |
| `/app/academics` | `Academics` | Nested in `/app` |
| `/app/skills` | `Skills` | Nested in `/app` |
| `/app/tasks` | `Tasks` | Nested in `/app` |
| `/app/roadmaps` | `Roadmaps` | Nested in `/app` |
| `/app/resume` | `Resume` | Nested in `/app` |
| `/app/jobs` | `Jobs` | Nested in `/app` |
| `/app/jobs/:id` | `JobDetails` | Nested in `/app` |
| `/app/applications` | `Applications` | Nested in `/app` |
| `/app/learning` | `Learning` | Nested in `/app` |
| `/app/admin/users` | `AdminUsers` | `RequirePermission(['users:read:any'])` |
| `/app/admin/applications` | `AdminApplications` | `RequirePermission(['applications:read:any'])` |
| `/app/admin/courses` | `AdminCourses` | `RequirePermission(['learning:courses:...'])` |
| `*` | Redirect to `/` | — |

### 5.4 Authentication State (`context/AuthContext.jsx`)

`AuthProvider` manages four pieces of state stored in `localStorage`:

| Key | Content |
|---|---|
| `token` | JWT access token (short-lived, 15 min) |
| `user` | `{ id, email, name, role }` object |
| `profile` | `{ userId, college, branch, graduationYear, careerGoal, onboarded }` |
| `auth` | `{ tenantId, roles, permissions }` RBAC snapshot |

**On mount**, `AuthProvider` runs a `restore()` effect:
1. If no token in localStorage → marks `ready = true` (unauthenticated state).
2. Calls `GET /api/auth/me` with the stored token to revalidate.
3. If `401`/`403` → attempts silent refresh via `POST /api/auth/refresh` (uses the HTTP-only cookie).
4. If refresh succeeds → re-fetches `/api/auth/me` with the new token.
5. On success → updates localStorage and React state.
6. On failure → clears all localStorage auth data.

**Context values exposed:**
- `ready`, `token`, `user`, `profile`, `auth`, `isAuthenticated`
- `login()`, `loginWithAuth()`, `logout()`, `refreshMe()`, `updateProfile()`, `setAuthSnapshot()`

### 5.5 Route Guards

**`PrivateRoute.jsx`**: Checks `isAuthenticated`. Redirects to `/student/login` if not authenticated. Optionally checks `profile.onboarded` (via `requireOnboarded` prop) and redirects to `/onboarding` if profile is incomplete.

**`RequirePermission.jsx`**: Checks `auth.permissions` from the context. Returns a `403` UI if the user lacks any of the specified permissions. Used only for admin routes.

### 5.6 API Integration (`lib/apiClient.js`)

The `apiClient` function is the core HTTP layer:

1. Reads the JWT from `localStorage`.
2. Injects `Authorization: Bearer <token>` header.
3. On **401 response**: calls `POST /api/auth/refresh` (with `credentials: 'include'` to send the HTTP-only cookie), updates localStorage with the new token, then retries the original request transparently.
4. Concurrent refresh calls are **deduplicated** via a shared `refreshPromise`.
5. On refresh failure: clears auth data and fires a `CustomEvent('auth:expired')`.
6. Wraps the standardised API envelope `{ ok, data }` and throws `ApiError` on non-OK responses.

Convenience aliases: `api.get()`, `api.post()`, `api.put()`, `api.patch()`, `api.delete()`.

### 5.7 Data Fetching (`hooks/useApi.js`)

All server state is fetched via React Query hooks centralised in `useApi.js`. This is the single source of truth for remote data. Each domain (academics, jobs, resume, skills, etc.) has dedicated query hooks covering list/detail/mutation operations.

**React Query configuration (`lib/queryClient.js`)**:
- `staleTime`: moderate (data considered fresh for a period before background refetch).
- `retry`: limited retries on transient errors.
- `refetchOnWindowFocus`: configured to avoid unnecessary requests.

### 5.8 Global State Management

Student OS intentionally keeps global state minimal:

| State | Location | Mechanism |
|---|---|---|
| Auth session | `AuthContext` | React Context + localStorage |
| Server data | individual hooks | React Query cache |
| UI-local state | component `useState` | Local React state |
| Toast notifications | `Toast` component | Custom event / prop passing |
| Confirmation dialogs | `ConfirmDialog` component | Prop-driven |

There is **no Redux, Zustand, or external state manager**. The React Query cache serves as the reactive server-state store.

---

## 6. Database Design

Student OS uses a **dual-database architecture**:

- **SQLite** (`better-sqlite3`): Primary store for all user-owned data — profile, academics, resume, skills, tasks, roadmaps, notifications, activity, RBAC. Synchronous API; zero network latency. WAL mode enabled for concurrent reads.
- **PostgreSQL**: Secondary store for the **job marketplace** — jobs, applications, postings, learning resources (courses). Used when horizontal scale or advanced SQL features (full-text search, GIN indexes) are needed.

### 6.1 SQLite Schema (via migrations 001–012)

#### Core Tables (`001_init.sql`)

| Table | Primary Key | Key Fields | Notes |
|---|---|---|---|
| `schema_migrations` | `id TEXT` | `applied_at` | Migration tracker |
| `users` | `id TEXT (UUID)` | `email UNIQUE`, `name`, `password_hash`, `provider`, `google_sub UNIQUE`, `role`, `status` | `status` ∈ ACTIVE/SUSPENDED/DELETED |
| `profiles` | `user_id TEXT → users` | `college`, `branch`, `graduation_year`, `career_goal`, `onboarded INT` | 1:1 with users |
| `academics_meta` | `user_id TEXT → users` | `attendance`, `career_goal` | |
| `academics_subjects` | `id AUTOINCREMENT` | `user_id`, `subject`, `score`, `grade` | UNIQUE(user_id, subject) |
| `assignments` | `id AUTOINCREMENT` | `user_id`, `title`, `due_date`, `status` | |
| `exams` | `id AUTOINCREMENT` | `user_id`, `subject`, `date`, `time` | |
| `resumes` | `user_id TEXT → users` | `data_json`, `updated_at` | Legacy simple resume storage |

#### Refresh Tokens (`002_refresh_tokens.sql`)

| Table | Notes |
|---|---|
| `refresh_tokens` | `id UUID`, `user_id`, `token_hash`, `created_at`, `expires_at`, `revoked_at`, `rotated_from`, `last_used_at`, `user_agent`, `ip` |

Only the **SHA-256 hash** of the raw token is stored (never the plaintext).

#### Resume Domain (`004_resume_domain.sql`)

| Table | Notes |
|---|---|
| `resume_documents` | One document per user; tracks `current_version` |
| `resume_versions` | Versioned snapshots; `status` ∈ UPLOADED/PARSING/PARSED/FAILED/OUTDATED |
| `resume_files` | Optional PDF backing per version |
| `resume_parsed_snapshots` | JSON blob of the parsed resume content |
| `resume_job_matches` | Match results keyed by `(user_id, job_id, resume_version_label, algorithm_version)` |
| `resume_targets` | User's targeted jobs for the matching loop |
| `learning_plans` | Generated plans keyed by `(user_id, job_id, resume_version_label, plan_version)` |
| `learning_plan_items` | Individual tasks within a plan; `status` ∈ not_started/in_progress/completed/skipped |
| `latex_templates` | Versioned LaTeX resume templates |
| `resume_renders` | Render job output: template + resume version → PDF path |

#### Trust & Observability (`005_trust_operability.sql`)

| Table | Notes |
|---|---|
| `activity_events` | Immutable timeline of user-visible events |
| `notifications` | In-app inbox linked to activity events |
| `job_status_snapshots` | Mirror of BullMQ job state for API polling (unique per user+job_type+scope) |
| `audit_logs` | Sensitive action log for admin/ops; never surfaced to users |

#### Multi-tenancy + RBAC (`006_multitenancy_rbac.sql`)

| Table | Notes |
|---|---|
| `tenants` | `kind` ∈ INDIVIDUAL/COLLEGE/RECRUITER/PLATFORM; default tenant UUID `00000000-…-0001` |
| `tenant_memberships` | Maps each user to exactly one tenant |
| `roles` | Platform-wide role definitions: STUDENT, COLLEGE_ADMIN, RECRUITER, PLATFORM_ADMIN |
| `permissions` | Fine-grained permission keys (e.g., `platform:admin`, `postings:job:approve`) |
| `role_permissions` | Many-to-many: role → permissions |
| `tenant_role_assignments` | Per-tenant role grants per user |

### 6.2 PostgreSQL Schema (via pg-migrations 001–008)

| Table | Notes |
|---|---|
| `jobs` | UUID PK; `type` ∈ job/internship; `search_tsv` GENERATED tsvector (GIN indexed) |
| `saved_jobs` | User's saved/bookmarked jobs |
| `applications` | One application per `(user_id, job_id)`; `status` ∈ APPLIED/SHORTLISTED/REJECTED/OFFERED |
| `job_postings` | Recruiter-submitted jobs pending admin review |
| `companies` | Company profiles linked to jobs |
| `skills` (PG) | Skills catalogue used for job tagging |
| `learning_resources` | Courses with `status` ∈ DRAFT/SUBMITTED/APPROVED/ARCHIVED |
| `course_skills` | Course → skill many-to-many |

### 6.3 Key Relationships

```
users ──1:1──> profiles
users ──1:1──> resume_documents ──1:N──> resume_versions
              resume_versions ──1:1──> resume_files
              resume_versions ──1:1──> resume_parsed_snapshots
users ──1:N──> resume_job_matches (links to jobs in PG)
users ──1:N──> learning_plans ──1:N──> learning_plan_items
users ──1:1──> tenant_memberships ──N:1──> tenants
users ──N:M──> roles (via tenant_role_assignments + role_permissions)
users ──1:N──> applications (PG) ──N:1──> jobs (PG)
```

---

## 7. Authentication Flow

### 7.1 Signup (`POST /api/auth/signup`)

1. **Validate** request body with `signupBody` Zod schema (name, email ≥ 1 char, password ≥ 8 chars).
2. **Check duplicate**: query SQLite `users` table by email; return `409 CONFLICT` if found.
3. **Hash password**: `bcrypt.hash(password, 12)` (cost factor 12).
4. **Create user**: insert into `users` with `provider = 'local'`, `role = 'user'`.
5. **Create profile**: `INSERT OR IGNORE INTO profiles` (ensures a profile row always exists).
6. **Build RBAC snapshot**: `ensureTenantMembership()` + `ensureDefaultRoleAssignments()` + `getAuthzSnapshot()`.
7. **Issue refresh token**: 48-byte random token; store only its SHA-256 hash in `refresh_tokens`; set as HTTP-only `refresh_token` cookie (`path: /api/auth`, 30-day TTL).
8. **Sign access token**: JWT with `{ id, email, name, role, tenantId, roles, permissions }`, expires in 15 minutes (`ACCESS_TOKEN_TTL`).
9. **Return** `201` with `{ token, refreshToken, user, profile, auth }`.

### 7.2 Login (`POST /api/auth/login`)

1. **Validate** with `loginBody` Zod schema.
2. **Brute-force check**: query Redis for failed attempt count by IP + email; return `429 TOO_MANY_REQUESTS` with `retryAfterSec` if blocked.
3. **Lookup user**: fetch by email; return `401 UNAUTHORIZED` (generic) if not found or deleted.
4. **Verify password**: `bcrypt.compare()`; on failure, record failed attempt and return `401`.
5. **Clear brute-force counter** on success.
6. **Build RBAC snapshot**, issue refresh token, sign access token — same as signup steps 6–8.
7. **Return** `200` with full auth payload.

Admin login (`POST /api/auth/login/admin`) follows identical steps but adds an RBAC check — returns `403 FORBIDDEN` if the user lacks an admin role.

### 7.3 Google SSO (`POST /api/auth/google`)

1. Verify the `credential` (Google ID token) with `google-auth-library`'s `OAuth2Client.verifyIdToken()`.
2. Extract `email`, `sub` (Google subject ID), and `name` from the verified payload.
3. Look up user by `google_sub`; fall back to lookup by email (for account linking).
4. If no existing user: create a new user with `provider = 'google'`, `password_hash = null`.
5. Continue with RBAC snapshot, refresh token, and access token issuance.

### 7.4 Token Storage

| Token | Storage | TTL | Notes |
|---|---|---|---|
| **Access token** | `localStorage['token']` (client) | 15 min | JWT; sent as `Authorization: Bearer` header |
| **Refresh token** (cookie) | HTTP-only cookie `refresh_token` | 30 days | Path limited to `/api/auth`; Secure in prod; SameSite Strict in prod |
| **Refresh token hash** | SQLite `refresh_tokens.token_hash` | 30 days | SHA-256 hash only; never stored in plaintext |

### 7.5 Token Refresh (`POST /api/auth/refresh`)

1. Read raw refresh token from `req.cookies.refresh_token` or `req.body.refreshToken`.
2. Hash it with SHA-256; look up the hash in `refresh_tokens`.
3. **Reuse detection**: if the token row is already `revoked_at`, revoke ALL tokens for that user and return `401`. This is a theft mitigation signal.
4. Check token expiry.
5. Look up user; reject if deleted.
6. **Rotate**: revoke the current token, issue a new one (`rotated_from` links back).
7. Return a fresh access JWT.

### 7.6 Logout (`POST /api/auth/logout`)

1. Requires valid access token (auth middleware).
2. Revokes the current refresh token by hash.
3. Clears the `refresh_token` cookie.

### 7.7 Token Verification (Protected Routes)

Every protected route uses `authMiddleware`:
1. Extract `Bearer` token from `Authorization` header.
2. `jwt.verify(token, JWT_SECRET)` — rejects expired or tampered tokens.
3. Always re-checks `users.status` in DB (prevents compromised tokens being used after account suspension).
4. Resolves fresh RBAC context.

### 7.8 Onboarding Trigger

After login/signup, the JWT payload does not contain an `onboarded` flag. The frontend reads `profile.onboarded` from the auth context. `PrivateRoute` with `requireOnboarded` redirects unonboarded users to `/onboarding`. The onboarding page calls `PUT /api/profile/:userId` with `onboarded: true` which sets the flag in SQLite.

---

## 8. API Endpoints

### Auth (`/api/auth`)

| Method | Path | Auth | Request Body | Response |
|---|---|---|---|---|
| `POST` | `/signup` | Public | `{ name, email, password }` | `201 { token, refreshToken, user, profile, auth }` |
| `POST` | `/login` | Public | `{ email, password }` | `200 { token, refreshToken, user, profile, auth }` |
| `POST` | `/login/student` | Public | `{ email, password }` | Same as `/login` |
| `POST` | `/login/admin` | Public | `{ email, password }` | `200` — fails with `403` if not admin |
| `POST` | `/google` | Public | `{ credential }` | `200 { token, refreshToken, user, profile, auth }` |
| `POST` | `/refresh` | Cookie | `refresh_token` cookie or `{ refreshToken }` | `200 { token }` |
| `POST` | `/logout` | JWT Required | — | `200 { ok: true }` |
| `GET` | `/me` | JWT Required | — | `200 { user, profile, auth }` |

### Profile (`/api/profile`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/:userId` | JWT Required | Fetch user profile |
| `PUT` | `/:userId` | JWT Required | Update profile fields (college, branch, graduationYear, careerGoal, onboarded) |

### Academics (`/api/academics`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/:userId/subjects` | JWT Required | List subjects with scores |
| `POST` | `/:userId/subjects` | JWT Required | Add/update a subject |
| `PUT` | `/:userId/subjects/:id` | JWT Required | Update a subject score |
| `DELETE` | `/:userId/subjects/:id` | JWT Required | Remove a subject |
| `GET` | `/:userId/meta` | JWT Required | Get attendance + career goal |
| `PUT` | `/:userId/attendance` | JWT Required | Update attendance percentage |
| `POST` | `/:userId/attendance/records` | JWT Required | Log a single attendance record |
| `GET` | `/:userId/assignments` | JWT Required | List assignments |
| `POST` | `/:userId/assignments` | JWT Required | Create assignment |
| `PUT` | `/:userId/assignments/:id` | JWT Required | Update assignment |
| `DELETE` | `/:userId/assignments/:id` | JWT Required | Delete assignment |
| `GET` | `/:userId/exams` | JWT Required | List exams |
| `POST` | `/:userId/exams` | JWT Required | Create exam |
| `PUT` | `/:userId/exams/:id` | JWT Required | Update exam |
| `DELETE` | `/:userId/exams/:id` | JWT Required | Delete exam |

### Resume (`/api/resume`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/:userId` | JWT Required | Get resume data (legacy JSON) |
| `PUT` | `/:userId` | JWT Required | Save resume data |
| `GET` | `/:userId/versions` | JWT Required | List resume versions |
| `GET` | `/:userId/versions/:versionLabel` | JWT Required | Get specific version + optional snapshot |
| `POST` | `/:userId/upload` | JWT Required | Upload resume PDF (multipart) |
| `GET` | `/:userId/templates` | JWT Required | List available LaTeX templates |
| `POST` | `/:userId/templates` | Admin | Create a LaTeX template |
| `POST` | `/:userId/render` | JWT Required | Enqueue a PDF render job |
| `GET` | `/:userId/renders/:renderId` | JWT Required | Check render status |

### Matching (`/api/matching`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/:userId/match` | JWT Required | Synchronous resume-to-job match (inline) |
| `POST` | `/:userId/enqueue` | JWT Required | Enqueue async resume matching job |
| `GET` | `/:userId/results` | JWT Required | List cached match results |
| `GET` | `/:userId/results/:jobId` | JWT Required | Get match result for a specific job |

### Skills (`/api/skills`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | JWT Required | List all available skills from catalogue |
| `GET` | `/:userId/profile` | JWT Required | Get user's skill profile |
| `PUT` | `/:userId/profile` | JWT Required | Update user's skill list |
| `GET` | `/:userId/gap` | JWT Required | Get skill gap analysis |

### Learning (`/api/learning`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/courses` | JWT Required | Browse approved courses |
| `POST` | `/courses` | Admin | Create a course |
| `PUT` | `/courses/:id` | Admin | Update course |
| `GET` | `/courses/:id` | JWT Required | Get course details |
| `GET` | `/:userId/plans` | JWT Required | List learning plans |
| `POST` | `/:userId/plans/enqueue` | JWT Required | Enqueue learning plan generation |
| `GET` | `/:userId/plans/:planId` | JWT Required | Get a specific plan |
| `PATCH` | `/:userId/plans/:planId/items/:itemKey` | JWT Required | Update plan item status |

### Jobs (`/api/jobs`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | JWT Required | List jobs (cursor-paginated, full-text search) |
| `GET` | `/:id` | JWT Required | Get job details |
| `POST` | `/` | Admin | Create a job listing |
| `PUT` | `/:id` | Admin | Update a job |
| `DELETE` | `/:id` | Admin | Deactivate a job |
| `GET` | `/status/all` | JWT Required | Get BullMQ job status snapshots |

### Applications (`/api/applications`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/:userId` | JWT Required | List user's applications |
| `POST` | `/:userId` | JWT Required | Apply to a job |
| `GET` | `/:userId/:id` | JWT Required | Get application detail |
| `PATCH` | `/:userId/:id/status` | Admin | Update application status |

### Postings (`/api/postings`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Recruiter+ | List postings (filter by status) |
| `POST` | `/` | Recruiter | Submit a new job posting |
| `GET` | `/:id` | Recruiter+ | Get posting detail |
| `POST` | `/:id/review` | Admin | Approve or reject a posting |

### Notifications (`/api/notifications`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/:userId` | JWT Required | List notifications (filterable, pageable) |
| `POST` | `/:userId/:id/read` | JWT Required | Mark a notification as read |
| `POST` | `/:userId/read-all` | JWT Required | Mark all as read |

### Activity (`/api/activity`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/:userId` | JWT Required | List activity events (pageable) |

### Tasks (`/api/tasks`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/:userId` | JWT Required | List tasks |
| `POST` | `/:userId` | JWT Required | Create a task |
| `PUT` | `/:userId/:id` | JWT Required | Update a task |
| `DELETE` | `/:userId/:id` | JWT Required | Delete a task |

### Roadmaps (`/api/roadmaps`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | JWT Required | List available roadmaps |
| `GET` | `/:id` | JWT Required | Get roadmap details |

### Admin (`/api/admin`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users` | `users:read:any` | List all users (paginated) |
| `GET` | `/users/:id` | `users:read:any` | Get user detail |
| `POST` | `/users/:id/promote` | `platform:admin` | Promote user to admin |
| `DELETE` | `/users/:id` | `platform:admin` | Soft-delete a user |

### Account (`/api/account`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/me` | JWT Required | Get own account info |
| `DELETE` | `/me` | JWT Required | Request account deletion (soft-delete) |

### Observability

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Liveness check |
| `GET` | `/api/ready` | Public | Readiness check (dependency health) |
| `GET` | `/api/metrics` | Public | In-process metrics snapshot |

---

## 9. Middleware System

### Applied Globally (in order)

| Middleware | Source | Purpose |
|---|---|---|
| `correlationId()` | `lib/correlationId.js` | Generates/propagates `X-Correlation-Id` for distributed tracing |
| `requestTiming()` | `lib/requestTiming.js` | Records request start timestamp for latency measurement |
| `httpLogger` | `lib/logger.js` (pino-http) | Structured JSON request logging with correlation ID |
| `helmet()` | npm `helmet` | Sets 11+ secure HTTP headers (no CSP/COEP to support frontend interop) |
| `hpp()` | npm `hpp` | Prevents HTTP Parameter Pollution attacks |
| `cors()` | npm `cors` | Allows configured origins with credentials (only if `CORS_ORIGIN` set) |
| `express.json()` | Express | Parses JSON bodies up to `JSON_BODY_LIMIT` (default 1mb) |
| `express.urlencoded()` | Express | Parses URL-encoded bodies |
| `cookieParser()` | npm `cookie-parser` | Parses cookies (needed for refresh_token HTTP-only cookie) |
| Metrics counter | inline `server.js` | Increments `http_requests_total` counter after each response |
| `rateLimit()` (global) | npm `express-rate-limit` | 600 req/min window on all `/api/*` routes |

### Applied Per-Route

| Middleware | Source | Purpose |
|---|---|---|
| `authMiddleware` | `middleware/auth.js` | JWT verification + RBAC context population |
| `authLimiter` | `express-rate-limit` in `routes/auth.js` | 30 req / 15 min on all auth routes |
| `validate({ body/query/params })` | `lib/validate.js` | Zod schema validation; returns 400 on failure |
| `requirePermission(key)` | `lib/rbac.js` | Fine-grained RBAC; returns 403 if permission missing |
| `requireAnyPermission(keys[])` | `lib/rbac.js` | OR-logic permission check |
| Brute-force guard | `lib/bruteForce.js` | Redis-backed: blocks IP+email after 8 failed logins in 10 min window |
| Redis rate limiter | `middleware/redisRateLimit.js` | Per-endpoint Redis-backed rate limiting (stricter than global) |

---

## 10. Testing Architecture

### Backend Tests

**Framework:** Vitest + Supertest

**Structure:**
```
backend/tests/
├── testApp.js          # Minimal Express app (no DB) for integration test isolation
├── unit/               # Pure function tests
│   ├── apiResponse.test.js     # Response helpers (apiSuccess, apiError, etc.)
│   ├── correlationId.test.js   # Correlation ID middleware behaviour
│   ├── metrics.test.js         # Counter and histogram functions
│   ├── requestTiming.test.js   # Timing middleware
│   ├── schemas.test.js         # Zod schema validation coverage
│   └── validate.test.js        # Validate middleware wrapper
└── integration/
    └── api.test.js     # End-to-end tests via supertest (auth flow, protected routes)
```

**Unit tests** cover pure utility functions in `lib/` with no external dependencies.

**Integration tests** use `testApp.js` to spin up a lightweight Express app against a real (in-memory or temp) SQLite database, then exercise the HTTP endpoints via Supertest.

**Coverage:** Collected with `@vitest/coverage-v8`, uploaded as a CI artifact (`backend/coverage/`).

**Run commands:**
```bash
cd backend
npm test              # Run all tests once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

### Frontend Tests

**Framework:** Vitest + @testing-library/react + jsdom

**Test colocation:** Test files live alongside components (e.g., `ConfirmDialog.test.jsx` next to `ConfirmDialog.jsx`).

**Covered components:**
- `ConfirmDialog` — interaction and rendering
- `EmptyState` — rendering and props
- `ErrorBoundary` — error catching behaviour
- `Spinner` — rendering
- `Toast` — rendering and dismiss behaviour

**Run commands:**
```bash
cd frontend
npm test              # Run all tests once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

### CI Pipeline (`.github/workflows/ci.yml`)

Three jobs run on every push or pull request to `main`:

```
backend-tests  ──→ (independent)  Runs unit + integration tests + uploads coverage
frontend-tests ──→ (independent)  Runs component tests + uploads coverage
frontend-build ──→ (after frontend-tests) Builds Vite production bundle + uploads dist artifact
```

- Node 20 LTS everywhere.
- `npm ci` used for reproducible installs.
- All jobs use `ubuntu-latest`.
- `concurrency: cancel-in-progress` — duplicate runs on the same branch are cancelled.
- Coverage artifacts retained for 14 days; build artifact for 7 days.

---

## 11. Environment Variables

### Backend (`.env.example`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Environment mode |
| `PORT` | No | `5000` | HTTP server port |
| `HOST` | No | `127.0.0.1` (dev), `0.0.0.0` (prod) | Bind address |
| `JWT_SECRET` | **Yes in prod** | Auto-generated ephemeral in dev | JWT signing secret |
| `ACCESS_TOKEN_TTL` | No | `15m` | JWT access token expiry |
| `REFRESH_TOKEN_TTL_DAYS` | No | `30` | Refresh token lifetime in days |
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth client secret |
| `DB_PATH` | No | `backend/data/student-os.sqlite` | SQLite file path |
| `PG_URL` | No | — | PostgreSQL connection string |
| `PG_READ_URL` | No | Fallback to `PG_URL` | PostgreSQL read-replica URL |
| `PGHOST` | No | — | PG host (alternative to PG_URL) |
| `PGUSER` | No | `student` | PG username |
| `PGPASSWORD` | No | `student` | PG password |
| `PGDATABASE` | No | `student_system` | PG database name |
| `PGPORT` | No | `5432` | PG port |
| `PG_SSL` | No | Auto in prod | Enable/disable PG SSL |
| `PGPOOL_MAX` | No | `20` | PG connection pool size |
| `PG_STATEMENT_TIMEOUT_MS` | No | `10000` | PG query timeout (ms) |
| `PG_MIGRATIONS_STRICT` | No | `false` | Fail startup if PG migrations fail |
| `PG_DISABLED` | No | — | Set to `1` to disable PG at runtime |
| `REDIS_URL` | No | — | Redis connection URL |
| `REDIS_HOST` | No | — | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | — | Redis auth password |
| `CORS_ORIGIN` | No | Disabled | Comma-separated allowed origins |
| `JSON_BODY_LIMIT` | No | `1mb` | Request body size limit |
| `TRUST_PROXY` | No | — | Number of proxy hops to trust |
| `HTTP_REQUEST_TIMEOUT_MS` | No | `30000` | HTTP request timeout |
| `LOG_LEVEL` | No | `debug` (dev) / `info` (prod) | Pino log level |
| `LOGIN_WINDOW_MS` | No | `600000` | Brute-force window (ms) |
| `LOGIN_MAX_ATTEMPTS` | No | `8` | Max failed logins before lockout |
| `LOGIN_BLOCK_MS` | No | `900000` | Lockout duration (ms) |
| `BULLMQ_ATTEMPTS` | No | `5` | BullMQ job retry count |
| `BULLMQ_BACKOFF_MS` | No | `5000` | BullMQ exponential backoff seed (ms) |
| `BULLMQ_REMOVE_ON_COMPLETE` | No | `500` | Max completed jobs to keep in Redis |
| `QUOTA_WARN_AT` | No | `0.8` | Quota warning threshold (0–1) |
| `APP_VERSION` | No | `1.0.0` | Reported in health check |

### Frontend (`.env.example`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | No | (relative) | API base URL override for non-same-origin deployments |

---

## 12. Known Risks and Technical Debt

### 🔴 High Priority

**1. SQLite as primary database**
SQLite (synchronous, file-based) is excellent for development and single-instance deployments. However, it cannot support horizontal scaling or multiple concurrent write processes. If the backend is ever deployed across multiple instances (e.g., behind a load balancer), SQLite will cause data corruption or split-brain. **Migration to PostgreSQL as the sole primary store** should be planned before scaling.

**2. JWT stored in localStorage**
Access tokens in `localStorage` are vulnerable to **XSS attacks**. If any injected script runs in the same origin, it can steal tokens. The refresh token is correctly HTTP-only, but the access token is not. Mitigation: move the access token to a `memory` store (React state only) with the refresh cookie driving silent refresh on page reload.

**3. No deployment/production configuration**
There is no `Dockerfile` for the backend, no Nginx reverse-proxy config, and no production deployment guide. The `docker-compose.yml` covers only infrastructure (Postgres + Redis), not the application. Running in production is entirely manual.

**4. No email verification**
The signup flow creates active accounts immediately without verifying email ownership. This allows anyone to register with a fake or someone else's email address.

### 🟡 Medium Priority

**5. In-process metrics (not Prometheus-compatible)**
The metrics module uses in-process `Map`s. These reset on server restart and cannot be aggregated across instances. While the code comments acknowledge this, integrating with Prometheus, StatsD, or OpenTelemetry should be done before production.

**6. Route-handler colocation**
Business logic lives directly inside `routes/*.js` files rather than in dedicated controller classes. While pragmatic now, this will become harder to test and maintain as routes grow. Extracting controllers is advisable.

**7. LaTeX rendering requires LaTeX installation**
`workers/resumeRendering.js` presumably shells out to `pdflatex` or similar. LaTeX is not a trivial runtime dependency and is absent from the Docker setup. The rendering pipeline will silently fail unless correctly provisioned.

**8. No refresh token expiry cleanup job**
The `refresh_tokens` SQLite table accumulates expired rows indefinitely. No scheduled job prunes them. Over time this will grow unbounded. A periodic cleanup task or TTL-enforced deletion is needed.

**9. Missing test coverage for routes**
Only 1 integration test file exists (`tests/integration/api.test.js`). All 16 route files and 4 service files have no route-level test coverage. Any regression in route logic is undetectable without manual testing.

**10. CORS disabled in same-origin production**
If frontend and backend serve from different origins in production (e.g., `app.example.com` vs `api.example.com`), `CORS_ORIGIN` must be set or all requests will be blocked. There is no reminder or check for this in the startup logs beyond a console warning.

### 🟢 Low Priority

**11. `data/` directory not in `.gitignore`**
The SQLite database file in `backend/data/` should be confirmed absent from version control. If a developer accidentally commits the `.sqlite` file, it may contain real user data.

**12. `requirements.txt` at root**
This file is for the Python launcher (`RUNSTUDENTOS.py`) but has no `requirements.in` or lockfile. Dependencies may drift silently.

---

## 13. System Data Flow

### Full User Journey: Signup → Login → Onboarding → Dashboard → Authenticated Actions

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          STUDENT OS DATA FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

1. LANDING  (/landing page, public)
   └── User clicks "Sign Up" or "Log In"

2. SIGNUP  POST /api/auth/signup
   ├── Frontend: Signup.jsx → POST { name, email, password }
   ├── Backend: Zod validate → hash password → INSERT users → INSERT profiles
   ├──         ensureTenantMembership → ensureDefaultRoleAssignments (STUDENT role)
   ├──         issueRefreshToken (SHA-256 hash stored) → set HTTP-only cookie
   ├──         signToken (JWT 15min) → return { token, user, profile, auth }
   └── Frontend: AuthContext.login() → localStorage token/user/profile/auth → redirect /onboarding

3. ONBOARDING  (/onboarding, requires login)
   ├── Frontend: Onboarding.jsx → user fills college, branch, graduation year, career goal
   ├──          → PUT /api/profile/:userId { college, branch, graduationYear, careerGoal, onboarded: true }
   ├── Backend: UPDATE profiles SET onboarded = 1
   └── Frontend: AuthContext.updateProfile() → profile.onboarded = true → redirect /app

4. DASHBOARD  (/app, requires login + onboarded)
   ├── Frontend: AppShell.jsx renders sidebar nav + nested route
   ├── Dashboard.jsx fetches: GET /api/academics/:userId, GET /api/tasks/:userId,
   │                          GET /api/notifications/:userId, GET /api/activity/:userId
   └── All data rendered via React Query with caching

5. AUTHENTICATED ACTIONS (examples)

   A. Resume Upload + Async Processing
      ├── Client: POST /api/resume/:userId/upload (multipart PDF)
      ├── Backend: multer saves file, hashes content, creates resume_documents/versions rows
      ├──         → enqueue BullMQ job: resume_processing queue
      ├──         → return job status id
      ├── Worker: resumeProcessing.js runs → pdf-parse extracts text → update resume_versions (PARSED)
      ├──         → write resume_parsed_snapshots
      └── Client: polls GET /api/resume/:userId/versions or job status snapshot

   B. Job Matching
      ├── Client: POST /api/matching/:userId/enqueue { jobId }
      ├── Backend: enqueueWithTenantQuota → BullMQ resume_matching queue
      ├── Worker: resumeMatching.js → load resume snapshot + job description
      ├──         → matchingEngine.computeScore() → store results in resume_job_matches
      └── Client: GET /api/matching/:userId/results/:jobId → display match score + skill gaps

   C. Learning Plan Generation
      ├── (Triggered after matching or explicitly)
      ├── Client: POST /api/learning/:userId/plans/enqueue { jobId }
      ├── Backend: enqueue BullMQ learning_plan_generation job
      ├── Worker: learningPlanGeneration.js → read skill gaps from resume_job_matches
      ├──         → learningPlanEngine.generate() → INSERT learning_plans + learning_plan_items
      └── Client: GET /api/learning/:userId/plans → renders personalised study path

   D. Job Application
      ├── Client: POST /api/applications/:userId { jobId, resumeVersion }
      ├── Backend: applicationService.apply() → check duplicate (UNIQUE constraint on user+job)
      ├──         → INSERT applications (PG) with status APPLIED
      ├──         → log audit_logs + activity_events + notification
      └── Client: GET /api/applications/:userId → track status (APPLIED/SHORTLISTED/REJECTED/OFFERED)

   E. Token Expiry + Silent Refresh
      ├── Any API call returns 401 (JWT expired)
      ├── apiClient.js: POST /api/auth/refresh (sends HTTP-only refresh cookie)
      ├── Backend: verify refresh token hash → rotate token → return new JWT
      ├──         (if refresh token also invalid: clear cookie, return 401)
      └── apiClient.js: retry original request with new JWT transparently

6. LOGOUT
   ├── AuthContext.logout() → POST /api/auth/logout (revokes refresh token in DB)
   ├── Backend: UPDATE refresh_tokens SET revoked_at → clearCookie
   └── Frontend: clear localStorage → redirect to /
```

---

*Document generated by automated architecture analysis — 2026-03-10*
*Source: `e:/student-os` workspace — all sections reflect actual code implementation*
