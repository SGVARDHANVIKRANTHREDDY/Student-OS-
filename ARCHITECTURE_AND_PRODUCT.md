# STUDENT OS — Engineering Project Document

**Document purpose**: This file explains the Student OS codebase end-to-end so a new engineer can maintain it and a reviewer can evaluate product/engineering quality. It is intentionally technical and avoids marketing.

**Repository shape**
- `backend/`: Node.js API + SQLite persistence
- `frontend/`: React SPA (Vite) consuming `/api/*`

---

## 1) Project Overview

### What Student OS is
Student OS is a private web application that centralizes a student’s placement-readiness workflow into one authenticated workspace.

The implemented product surface is a set of modules under an authenticated `/app/*` area:
- Academics tracking (subjects/scores, attendance, career goal)
- Tasks (assignments + exams)
- Resume builder + preview + local analysis
- Job matching (preset roles or custom job description)
- Skill gap analysis (must-have vs good-to-have) and a generated learning path
- Placement roadmaps (company + role selection)

### The real problem it solves
Students preparing for internships/entry-level roles often spread their work across notes, spreadsheets, document files, and random links. That fragmentation makes it hard to:
- keep an updated resume as skills/projects change
- compare resume readiness to job requirements
- consistently execute a learning plan to close gaps

Student OS focuses on keeping these artifacts in one place and enforcing a consistent loop from “current state” → “gap” → “plan” → “updated resume”.

### Target users
Based on the UI copy and feature set, the app targets:
- Students actively preparing for placements (internships / entry-level)
- Users who want lightweight, structured tracking rather than a heavy LMS

### Why this product exists (as implemented)
The codebase is built around a deterministic, explainable workflow:
- store core student data locally (SQLite)
- compute resume/role readiness via rule-based analysis
- generate learning paths from a curated in-memory database

This yields fast iteration, zero external AI dependencies, and predictable outputs.

---

## 2) Product Vision & Core Flow

### Core product loop (implemented)
Student OS is designed as a loop:

**Academics → Skills → Resume → Jobs → Learning → Resume**

In the current codebase, that loop maps to:

1. **Signup/Login**
   - User authenticates using email/password or optional Google sign-in.
2. **Onboarding**
   - User completes a minimal profile (college/branch/graduation year/career goal).
   - `profile.onboarded` gates access to the main app.
3. **Academics**
   - User records attendance and subjects + scores.
   - User can set a “career goal” in this module (note: separate from profile career goal).
4. **Resume**
   - User builds a structured resume (summary, education, skills, projects, experience).
   - User saves and can run an analysis endpoint that produces quality/ATS scores and missing-skill suggestions.
5. **Jobs (matching, not listings)**
   - User selects a preset role (e.g. Frontend Engineer) or pastes a job description.
   - System matches resume skills against role/job requirements and returns a match percentage, strengths, and missing skills.
6. **Learning**
   - User runs “Skill Gap Translator” to compute prioritized missing skills.
   - User generates a learning path from missing skills, with stages, concepts, mini-projects, and resources.
7. **Back to Resume**
   - The intended outcome is for the user to complete learning tasks and then update resume skills/projects accordingly.

### Notes on what’s currently implemented vs intended
- “Jobs” as listings/applications is **not implemented** (the `/app/jobs` page explicitly states it is coming next).
- “Learning” as a standalone module is **not implemented**; the learning engine is invoked from the Resume flow.
- “Skills” as its own CRUD module is **not implemented**; skill-gap tooling lives inside the Resume module.

---

## 3) Tech Stack

### Frontend
- **Framework**: React 18 (`react`, `react-dom`)
- **Routing**: `react-router-dom` v6 (nested routes under `/app`)
- **Build/dev**: Vite 5 (`vite`, `@vitejs/plugin-react`)

**Why these choices (as reflected by the codebase)**
- React + React Router provides a straightforward SPA structure for module-based navigation.
- Vite offers fast local dev and a minimal configuration footprint.
- No additional state libraries are used; the product’s current complexity is handled with Context + local component state.

### Backend
- **Runtime / framework**: Node.js + Express (`express`)
- **Auth**: JWT (`jsonwebtoken`) + password hashing (`bcryptjs`)
- **Optional identity provider**: Google Identity via `google-auth-library` (backend) and Google Identity Services button (frontend)
- **Config**: `dotenv`

**Why these choices**
- Express is used to expose REST endpoints consumed by the SPA.
- JWT-based auth keeps the backend stateless (no server sessions).
- SQLite keeps persistence simple for single-node deployments and local environments.

### Database
- **SQLite** via `better-sqlite3`
- Default path: `backend/data/student-os.sqlite` (override with `DB_PATH`)

### State management
- **Auth state**: React Context (`AuthContext`) + `localStorage` persistence
- **Feature state**: Component-level state (`useState`) with `fetch`/`apiFetch` calls

### AI / logic components
There is **no external AI model** integration in the current codebase.
Instead the app uses deterministic, rule-based logic:
- Resume “quality”/“ATS” scores from heuristic checks
- Job matching from overlap between resume skills and role/job skills
- Skill gap classification from a preset skills taxonomy
- Learning paths from a curated in-memory learning database

---

## 4) Application Architecture

### High-level architecture

- React SPA (Vite dev server on `:3000`) calls `/api/*`
- Vite proxies `/api/*` to Express on `127.0.0.1:5000`
- Express reads/writes SQLite for persisted modules

In production terms, this is a classic “SPA + JSON API + single database” architecture.

### Backend composition and separation of concerns
- `backend/server.js`
  - Express app setup (JSON parsing, security headers, optional CORS)
  - Route registration: `/api/auth`, `/api/profile`, `/api/academics`, `/api/tasks`, `/api/resume`, `/api/matching`, `/api/skills`, `/api/learning`, `/api/roadmaps`
  - Health endpoint: `/api/health`
  - Global error handler (500)

- `backend/middleware/auth.js`
  - Extracts `Authorization: Bearer <token>`
  - Verifies JWT and attaches `req.user`
  - Enforces `:userId` path authorization when present

- `backend/lib/db.js`
  - Initializes SQLite and schema
  - Exposes a singleton `getDb()`

- `backend/routes/*`
  - Each feature module is an isolated Express router

### Frontend composition and separation of concerns
- `frontend/src/App.jsx`
  - Route table
  - Private route gating and onboarding gating
- `frontend/src/components/*`
  - Feature widgets and reusable UI (AppShell, section components)
- `frontend/src/pages/*`
  - Page-level modules (Dashboard, Academics, Resume, Roadmaps, etc.)
- `frontend/src/context/AuthContext.jsx`
  - Auth/session lifecycle and persistence
- `frontend/src/lib/api.js`
  - `apiFetch` helper to standardize JSON requests and attach Authorization header

### Scalability considerations (as of today)
What the current architecture supports well:
- Single-node deployments (stateless JWT auth)
- Clear separation between persisted modules (SQLite) and computed modules (in-memory)

Current constraints to be aware of:
- SQLite is file-based; concurrency and horizontal scaling are limited compared to a server DB.
- Some modules are intentionally in-memory (matching/skills taxonomy/learning/roadmaps), so they are not user-configurable and would need persistence to become multi-tenant configurable.

---

## 4.1) Module 5 — Platform Hardening (Boundaries, Governance, Safeguards)

This section describes the *additive* platform hardening work: multi-tenancy, governance (RBAC), quotas/metering, scalable search, and account lifecycle.

### Platform boundaries (what lives where)
- **SQLite** remains the primary system-of-record for user-facing modules and platform governance:
  - tenants + memberships + roles/permissions
  - audit/activity/job-status snapshots
  - billing plans/entitlements + durable usage counters
  - resume domain artifacts (versions, parsed snapshots, renders, matches, learning plans)
- **Redis + BullMQ** is the async execution substrate:
  - queues: resume parsing, resume matching, learning plan generation, resume rendering
  - tenant-scoped short-window quotas for background-job enqueues (fail-open if Redis is absent)
- **Postgres** is used for scale-sensitive search/listing domains:
  - jobs listings + cursor-based search/ranking
  - learning resources search (tenant-scoped)

### Invariants (multi-tenant safety)
- Any table with a `tenant_id` column must be queried with tenant scope (`tenant_id IS ?`) and written with the effective tenant.
- `/:userId/*` routes must reject cross-user access unless the caller has `platform:admin`.
- Worker payloads must propagate `tenantId` and `userId` so job status/audit/activity are tenant-correct.

### Quotas & metering model
- **Entitlements** are plan-scoped (`entitlements.plan_key + feature_key`).
- **Durable metering** uses SQLite `usage_counters` and supports `month`, `day`, and `hour` period keys.
- **Enqueue quotas** (for expensive background work) use Redis TTL counters keyed by tenant.
- Enforcement is graceful:
  - API returns `429` with `code`, `limit`, `used`, and `retryAfterSec` when applicable.
  - Near-limit warnings may be returned via `X-StudentOS-Quota-Warn`.

### Account lifecycle & deletion
- Soft delete is represented on `users` (`status`, `deleted_at`) and tracked in `account_deletions`.
- API supports:
  - export: `GET /api/account/me/export`
  - soft delete: `DELETE /api/account/me`
- Auth blocks non-`ACTIVE` accounts (except idempotent delete retries).
- Workers skip expensive work for non-`ACTIVE` accounts.

### Operational runbook (migration + readiness)
- SQLite migrations run automatically at startup via `getDb()`.
- Postgres migrations are explicit:
  - run `cd backend && npm run migrate:pg`
- Health endpoints:
  - `/api/health` liveness
  - `/api/ready` checks SQLite + (optional) Redis + (optional) Postgres

---

## 5) Authentication & Onboarding Flow

### Authentication modes
1. **Email/password**
   - `POST /api/auth/signup`: creates `users` row with `password_hash` and a default `profiles` row.
   - `POST /api/auth/login`: verifies password via bcrypt.

2. **Google sign-in (optional)**
   - Frontend renders Google button only when `VITE_GOOGLE_CLIENT_ID` is set.
   - Backend requires `GOOGLE_CLIENT_ID`.
   - `POST /api/auth/google` verifies the Google ID token and links by `google_sub` or email.

### Session model
- Backend issues a JWT (7 day expiry).
- Frontend stores:
  - `token` in `localStorage`
  - `user` and `profile` snapshots in `localStorage`
- On app load, `AuthContext` calls `GET /api/auth/me` to validate token and refresh user/profile.

### Onboarding steps (implemented)
The onboarding UI is a two-step form that writes to the profile:
- Step 1: college, branch, graduationYear, careerGoal
- Step 2: confirms/collects careerGoal (required here), plus college and branch

On completion:
- Frontend calls `POST /api/profile/me` with `{ ..., onboarded: true }`.
- The app gates access to `/app/*` with `profile.onboarded`.

### Data collected during onboarding
Stored in `profiles` table:
- `college` (string)
- `branch` (string)
- `graduation_year` (string)
- `career_goal` (string)
- `onboarded` (boolean stored as integer)

### How user state is persisted
- Canonical persistence: SQLite (`profiles`)
- Client cache: `localStorage` (token + last-known user/profile)

---

## 6) Feature Modules (Very Important)

This section documents each module as it exists in the codebase: purpose, key features, data handled, and integrations.

### Dashboard
**Purpose**: Provide a quick “placement readiness snapshot” and navigation.

**Key features**
- Renders `StatusCards` and quick navigation buttons.

**Data handled**
- Currently **no real backend data** is fetched here; status cards are placeholders.

**Connections**
- Navigates into Roadmaps, Resume, Academics.

### Academics
**Purpose**: Track academic performance inputs that influence planning.

**Key features**
- Subjects + scores (upsert by subject)
- Attendance percent
- Career goal (stored in academics metadata)

**Data handled (persisted in SQLite)**
- `academics_subjects`: per-user subject, score, grade
- `academics_meta`: attendance, career_goal

**Connections**
- Career goal exists both in `profiles.career_goal` (onboarding) and `academics_meta.career_goal` (academics module). These are currently separate data stores.

### Skills
**Purpose**: Skills management entry point.

**Current state**
- The `/app/skills` page is informational only.
- Skill gap analysis is implemented under the Resume module (see below).

**Data handled**
- No separate skills persistence exists; resume skills are stored inside the resume JSON.

**Connections**
- Resume → Job Matching → Skill Gap Translator uses resume.skills.

### Tasks
**Purpose**: Centralize assignments and exams.

**Key features**
- CRUD for assignments (create/list/update status/delete)
- Create/list/delete for exams

**Data handled (persisted in SQLite)**
- `assignments`: title, due_date, status
- `exams`: subject, date, time

**Connections**
- Independent of resume/matching flows; can later be used to drive dashboard status.

### Resume (Resume Builder + Matching)
**Purpose**: Keep the resume as the canonical artifact and drive readiness analysis.

**Key features**
- Resume builder form and live preview
- Persist and reload resume
- Resume analysis (quality score, ATS score, missing skill suggestions)
- Job matching against preset roles or custom job description
- Skill gap translation into prioritized missing skills
- Learning path generation invoked as a modal inside Resume flow

**Data handled (persisted in SQLite)**
- `resumes` table: `user_id`, `data_json`, `updated_at`
- Resume JSON structure (as used by backend):
  - `summary: string`
  - `education: array`
  - `skills: array of strings`
  - `projects: array`
  - `experience: array`

**Connections**
- Calls matching endpoints to compute readiness.
- Feeds missing skills into learning path generator.
- Provides the primary “loop closure”: after learning, user updates resume skills/projects.

### Jobs / Internships
**Purpose**: Job discovery and application workflow.

**Current state**
- The `/app/jobs` page is a placeholder that explicitly states listings/filters/saved jobs/applications are coming next.
- The “jobs” capability currently implemented is “Job Matching” under the Resume module.

**Data handled**
- No job listing storage or application tracking exists yet.

**Connections**
- Resume → Matching provides “apply vs improve” recommendation.

### Learning / Skill Paths
**Purpose**: Generate a structured learning plan from skill gaps.

**Current state**
- `/app/learning` page is informational; it points users to Resume → Skill Gap → Learning Path.
- The learning engine is implemented in the backend as a curated in-memory database keyed by skill.

**Key features**
- Generate ordered learning paths for missing skills.
- Each skill includes multiple stages with concepts, mini-projects, and resource links.

**Data handled**
- Learning content is **not persisted**.
- Input is a list of missing-skill objects (name + importance + difficulty).

**Connections**
- Skill Gap Translator output → Learning Path generator.

### Placement Roadmaps
**Purpose**: Provide role+company aligned preparation structure.

**Key features**
- Lists companies and roles
- Fetches a combined roadmap with:
  - outcomes
  - DSA topics
  - project ideas
  - resume checklist
  - mock suggestions

**Data handled**
- Currently in-memory on the backend; no user customization or persistence.

**Connections**
- Uses auth token; otherwise independent.

---

## 7) Data Flow & State Management

### Data movement
- Frontend uses `fetch` or `apiFetch` to call `/api/*`.
- Authenticated calls include `Authorization: Bearer <jwt>`.
- Vite dev proxy routes `/api` → backend.

### Persistence model
**SQLite persisted**
- Users and profiles
- Academics meta and subjects
- Tasks (assignments + exams)
- Resume JSON

**Not persisted (in-memory / computed)**
- Job roles and job matching logic
- Skill taxonomy and skill-roadmap metadata
- Learning database content
- Placement roadmaps

### Session maintenance
- JWT in `localStorage`
- `AuthContext` restores session by calling `/api/auth/me` and clearing local state on 401.

### Validation and error handling
Backend:
- Validates most inputs with basic checks (required fields, numeric bounds, etc.).
- Returns `400` for invalid input, `401` for auth failures, `404` for missing entities.
- Has a global error handler that returns `500` with a generic message.

Frontend:
- Login/Signup/Onboarding have explicit error messages and loading states.
- Most feature modules log errors and show minimal UI fallback (some show “Loading…”, others do not display error states).

---

## 8) UX & Product Decisions

### Why the UX is structured this way
- **Gated onboarding**: Access to the main app requires a completed profile (`profile.onboarded`) to ensure downstream modules have baseline context.
- **Sidebar module navigation**: Standard SaaS “app shell” pattern for multi-module workflows.
- **Resume as the hub**: Matching, skill gaps, and learning are nested in Resume because resume data is the shared dependency.

### SaaS patterns followed
- Authenticated area (`/app`) separated from public/auth pages (`/`, `/login`, `/signup`).
- Stateless auth (JWT) with client-side persistence.
- Clear module boundaries in backend routes.

### What was intentionally NOT built yet (based on the UI/code)
- Job listings, filters, saved jobs, and application tracking
- Standalone Skills module CRUD
- Standalone Learning progress tracking
- Dashboard metrics wired to real data (current cards are placeholders)
- Admin tooling, multi-tenant org concepts, and role-based access control

---

## 9) Security & Best Practices

### Authentication safety
- Passwords are hashed using bcrypt.
- JWT is required for protected endpoints via middleware.
- Token expiry is set to 7 days.

### Authorization
- The auth middleware blocks cross-user access for routes using `/:userId` by comparing `req.params.userId` to `req.user.id`.

### Production configuration
- `JWT_SECRET` is required in production (backend throws if missing); dev uses an insecure fallback.
- CORS is disabled unless `CORS_ORIGIN` is configured; this aligns with same-origin production deployments.

### Security headers
Backend sets:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`

### Gaps / follow-ups to reach hardened production
These are not criticisms; they are concrete areas the current code does not implement:
- No rate limiting / brute-force protection on auth routes.
- No centralized request schema validation (e.g., zod/joi); validations are hand-rolled per route.
- No refresh token rotation; JWT is long-lived (7 days).
- No audit logging.
- SQLite operational concerns (backups, corruption handling, migrations) are not addressed beyond basic schema creation.

---

## 10) Current Status & Next Phases

### Completed (implemented end-to-end)
- Email/password auth + session restore
- Optional Google sign-in (requires env configuration)
- Onboarding gating
- Academics CRUD (subjects/attendance/career goal)
- Tasks CRUD (assignments/exams)
- Resume persistence + preview
- Resume analysis (quality/ATS scoring + missing skills suggestion)
- Job matching (preset role or custom job description)
- Skill gap analysis (must-have vs good-to-have, prioritized missing skills)
- Learning path generation (staged plan with mini-projects/resources)
- Placement roadmaps (company/role selector → roadmap output)

### Partially implemented / intentionally minimal
- Dashboard status cards are placeholders (no backend aggregation yet).
- Skills and Learning pages are placeholders pointing into the Resume-driven flow.

### Next phases (realistic extensions suggested by existing code paths)
- **Jobs module**: implement listings + saved jobs + application tracking (the UI already signals this as “coming next”).
- **Progress tracking**: persist learning path progress (checkboxes, completion dates) to close the loop more concretely.
- **Dashboard wiring**: compute readiness metrics from persisted resume/tasks/academics and display real status.
- **Data model consolidation**: unify “career goal” between `profiles` and `academics_meta` to avoid drift.
- **Security hardening**: add rate limiting to auth routes and centralized input validation.

---

## Appendix: API Surface (summary)

Auth
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/google` (optional)
- `GET /api/auth/me`

Profile
- `GET /api/profile/me`
- `POST /api/profile/me`

Academics
- `GET /api/academics/:userId/academics`
- `POST /api/academics/:userId/academics`
- `POST /api/academics/:userId/attendance`
- `POST /api/academics/:userId/career-goal`

Tasks
- `GET /api/tasks/:userId/assignments`
- `POST /api/tasks/:userId/assignments`
- `PUT /api/tasks/:userId/assignments/:id`
- `DELETE /api/tasks/:userId/assignments/:id`
- `GET /api/tasks/:userId/exams`
- `POST /api/tasks/:userId/exams`
- `DELETE /api/tasks/:userId/exams/:id`

Resume
- `GET /api/resume/:userId`
- `POST /api/resume/:userId`
- `POST /api/resume/:userId/analyze`

Matching
- `GET /api/matching/roles/list`
- `POST /api/matching/:userId/match`

Skills
- `POST /api/skills/:userId/skill-gaps`

Learning
- `POST /api/learning/:userId/paths`

Roadmaps
- `GET /api/roadmaps/companies`
- `GET /api/roadmaps/roles`
- `GET /api/roadmaps/:companyId/:roleId`
## Production Readiness Summary

Student OS is production-structured but intentionally lightweight.
It is suitable for:
- Single-tenant or small multi-tenant usage
- Local and small cloud deployments

Scaling beyond this would require:
- Migration from SQLite to managed DB
- Background job processing
- Caching and rate limiting
- Centralized observability
