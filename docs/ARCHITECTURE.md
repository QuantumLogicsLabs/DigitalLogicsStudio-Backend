# Backend Architecture

## Purpose

The backend provides the persistent service layer for Digital Logics Studio:

- Account registration, login, and password reset (OTP-based).
- httpOnly cookie-based JWT sessions.
- Current-user lookup for session restoration.
- User-specific problem and topic progress.
- Daily activity rollups and recent activity events.
- Email notifications (welcome, milestones, weekly digest, inactivity) via a durable queue.
- A problem catalog CRUD API (implemented, **not yet consumed by the frontend**).
- Saved "Trainer Board" breadboard circuits, scoped per user (a separate tool from Boolforge).
- An AI assistant surface (chat, hints, circuit generation) proxying to Groq / an internal CircuitMind API.
- Swagger/OpenAPI documentation.

## Runtime Composition

```text
server.js
  loads environment
  validates required secrets
  connects to MongoDB locally
  exports Vercel handler in production

src/app.js
  creates Express app
  configures body parsing, cookies, compression, CORS, headers
  mounts Swagger
  mounts domain routes
  mounts 404 and error middleware
```

This split keeps process concerns out of the app definition. It also makes the Express app reusable for tests and serverless handlers.

## Request Lifecycle

1. Request reaches Express.
2. JSON and URL-encoded body parsers apply a `10kb` limit.
3. `cookie-parser` exposes `req.cookies`.
4. Compression is enabled.
5. Security headers set crawler and referrer behavior.
6. CORS validates the request origin against static and environment-provided origins.
7. Route handler validates input and calls the domain controller.
8. Protected routes call `protect`, verify the cookie JWT, and attach `req.user`.
   Some routes additionally call `requireRole(...)` (currently only the Problems
   write routes — see `RBAC_FLOW.md`) or `loadUserProgress` (progress routes only).
   `/api/internal/*` uses a separate `internalAuth` guard (static bearer token) instead
   of `protect`. `/api/ai/*` uses its own `requireAiAuth`, which accepts either an
   `Authorization: Bearer` header or the same cookie, with a local-dev bypass.
9. Controller mutates Mongoose documents and returns JSON.
10. `notFound` and `errorHandler` normalize error responses.

## Domain Boundaries

| Layer | Location | Responsibility |
| --- | --- | --- |
| Config | `src/config` | Database connection and Swagger definition. |
| Routes | `src/routes` | HTTP paths, middleware ordering, Swagger annotations, for auth/health/progress/problems/circuits/internal. |
| AI Routes | `src/ai/*` | Separate sub-app for chat, hints, and AI circuit generation — its own auth (`aiAuth`), rate limiting (`aiRateLimit`), controllers, and prompt building. Kept apart from the main `src/routes`/`src/controllers` tree since it has different auth semantics. |
| Controllers | `src/controllers` | Request validation, domain orchestration, response shape, for auth/progress/problems/circuits. |
| Middleware | `src/middleware` | Auth guard (`protect`/`requireRole`), progress loader, internal-auth guard, and centralized error handling. |
| Models | `src/models` | Mongoose schemas: `User`, `UserProgress`, `Problem`, `SavedCircuit`, `EmailQueue`. See `DATABASE_SCHEMA.md`. |
| Services | `src/services` | `emailQueueService` (send/retry), `notificationService` (welcome/milestone/digest/inactivity triggers), `scheduler` (local-dev-only polling; production relies on Vercel Cron hitting `/api/internal/run-daily-jobs`). |
| Token helper | `src/utils/token.js` | JWT generation and cookie options. Imported by `authController.js` as `../utils/token` — **this now matches the actual file location** (see Known Technical Debt below for history). |

## Authentication Architecture

The API uses state-light sessions:

- Login/register returns sanitized user data and sets a signed JWT cookie.
- The cookie is `httpOnly`, preventing JavaScript reads.
- Protected requests send the cookie automatically when the frontend uses `withCredentials: true`.
- The backend verifies `JWT_SECRET`, finds the user by `decoded.userId`, excludes the password, and attaches the user document to `req.user`.
- A parallel password-reset flow exists: `forgotPassword` issues a hashed, time-limited OTP
  by email; `verifyResetOtp` exchanges a correct OTP for a short-lived reset token;
  `resetPassword` consumes that token to set a new password. See `AUTH_FLOW.md`.
- `authController.js` also exports `changePassword` and `deleteAccount` functions, but
  **neither is currently wired to a route** in `authRoutes.js` — they exist as
  ready-to-mount logic, not as live endpoints today.

## Progress Architecture

Progress now lives in its own **`UserProgress`** collection (one document per user,
linked by `userId`), loaded on demand via the `loadUserProgress` middleware — **not**
embedded on the `User` document anymore:

- `User.solvedProblems` remains as a small legacy flat array for backward-compatible
  frontend auth-state shape.
- `UserProgress.problemProgress` stores attempts, status, timestamps, title, tags, and topic association.
- `UserProgress.topicProgress` stores topic completion percentage and completed subtopics.
- `UserProgress.activityLog` stores daily counters keyed by `YYYY-MM-DD`.
- `UserProgress.recentEvents` stores the newest activity feed entries with a cap of 30.

This split means `protect` (run on every authenticated request) no longer has to load
progress data — only routes that actually need it also run `loadUserProgress`. A
one-time migration script (`scripts/migrateProgress.js`) exists for databases that
predate this split; it's not needed on a fresh setup.

## Email Notification Architecture

See `EMAIL_NOTIFICATIONS.md` for full detail. Summary: notifications are written to
`EmailQueue` and sent inline in the same request (`enqueueAndSend`), with retry/backoff
handled by `processPendingEmails`. In production (Vercel serverless, no long-running
process) a single daily cron hits `/api/internal/run-daily-jobs`, which runs the queue
retry, inactivity check, and weekly digest together — all three are idempotent
per-user. In local development, `startLocalScheduler()` polls instead.

## Engineering Decisions

- **httpOnly cookies over localStorage tokens:** reduces token exposure from XSS.
- **CORS allowlist:** avoids reflecting arbitrary origins while supporting known preview and production domains.
- **Mongoose document helpers:** keeps progress initialization close to schema definitions.
- **Separate `UserProgress` collection:** keeps the hot `protect` path (every authenticated request) from loading progress data it doesn't need.
- **Swagger annotations near routes:** keeps API docs close to HTTP behavior.
- **Serverless-aware preflight handling:** keeps cross-origin browser requests from timing out before DB connection.
- **Durable email queue with inline send:** gets near-instant delivery in the common case while surviving Vercel's stateless serverless model — see `EMAIL_NOTIFICATIONS.md`.

## Known Technical Debt

- ~~Token helper import path should be normalized before production hardening.~~
  **Resolved** — `src/utils/token.js` exists at the path `authController.js` imports
  (`../utils/token`); there is no mismatch in the current tree.
- `role`-based authorization (`requireRole`) exists and is enforced on the Problems
  write routes, but there is no route or admin UI to actually assign a non-default
  role — see `RBAC_FLOW.md`. Promotion currently requires a manual DB edit.
- The Problems catalog and its CRUD API are implemented but **not yet called by the
  frontend** — see `RBAC_FLOW.md` and `SETUP_GUIDE.md`.
- `authController.changePassword` and `authController.deleteAccount` are implemented
  but not mounted to any route.
- Add request rate limiting for auth endpoints (password-reset OTP routes have
  dedicated rate limiters; register/login do not).
- Add automated tests for auth, progress idempotency, RBAC, and CORS behavior.
- Add structured logs and request IDs for incident response.
