# Digital Logics Studio Backend Documentation

This directory documents the backend service for Digital Logics Studio, a Node.js, Express, MongoDB, and Mongoose API that powers authentication, session restoration, learning progress persistence, a problem catalog, saved Trainer Board circuits, and an AI assistant surface for the frontend.

The backend is intentionally small, but it follows production service boundaries: app composition lives in `src/app.js`, process startup lives in `server.js`, persistence is isolated behind Mongoose models, and route handlers are split by domain (plus a separate `src/ai` sub-tree for the AI assistant, which has its own auth model).

## Documentation Map

| Document | Purpose |
| --- | --- |
| `SETUP_GUIDE.md` | Local development prerequisites, environment variables, install, and run workflow. |
| `DEPLOYMENT_GUIDE.md` | Vercel/serverless deployment notes, environment configuration, CORS, and release checks. |
| `ARCHITECTURE.md` | Runtime architecture, request lifecycle, module responsibilities, and engineering decisions. |
| `API_DOCUMENTATION.md` | REST endpoints, request/response examples, status codes, and cookie behavior. |
| `DATABASE_SCHEMA.md` | Current MongoDB/Mongoose schema for all five collections, indexes, and data practices. |
| `AUTH_FLOW.md` | Registration, login, logout, password reset, notification toggle, session verification, and JWT cookies. |
| `RBAC_FLOW.md` | Current authorization model — what `role`/`requireRole` actually gate today, and what's still missing. |
| `FOLDER_STRUCTURE.md` | Directory-by-directory explanation of the backend codebase. |
| `EMAIL_NOTIFICATIONS.md` | The four notification types, the durable queue, and the cron/scheduler split between prod and local dev. |
| `CONTRIBUTING.md` | Contribution workflow, coding standards, testing expectations, and PR checklist. |
| `SECURITY.md` | Supported reporting process, secret handling, API hardening, and vulnerability response. |
| `CODE_OF_CONDUCT.md` | Community conduct expectations for maintainers and contributors. |
| `CHANGELOG.md` | Human-readable backend release history. |

For the authoritative, always-in-sync list of every route, request/response shape, and
auth requirement, see Swagger at `/api/docs` (or `/api/docs.json`) once the server is
running — the docs above summarize it, but Swagger is generated directly from the route
JSDoc and won't drift the way hand-written prose can.

## Service Summary

- Runtime: Node.js with CommonJS modules.
- Framework: Express 4.
- Database: MongoDB through Mongoose (5 collections — see `DATABASE_SCHEMA.md`).
- Authentication: JWT signed with `JWT_SECRET`, stored in an httpOnly cookie named `token`. Separate OTP-based password reset flow. Separate `role` field (`student`/`instructor`/`admin`) with partial RBAC enforcement — see `RBAC_FLOW.md`.
- Password storage: bcrypt hashes via Mongoose pre-save hook.
- Email: durable queue (`EmailQueue`) + Gmail/nodemailer transporter, driven by Vercel Cron in production and a local poller in development.
- AI assistant: Groq-backed chat/hint/circuit-generation endpoints under `/api/ai`, with an optional Pinecone RAG layer.
- API documentation: Swagger UI at `/api/docs` and OpenAPI JSON at `/api/docs.json`.
- Deployment target: Vercel serverless function export in production, normal `app.listen` in local development.

## Current Public API Surface

Grouped by domain; see `API_DOCUMENTATION.md` and Swagger for full request/response
shapes.

**Health**
- `GET /`
- `GET /api/health`

**Auth** (`/api/auth`)
- `POST /register`, `POST /login`, `POST /logout`, `GET /me`
- `POST /forgot-password`, `POST /verify-reset-otp`, `POST /reset-password`
- `PATCH /notifications`
- *(implemented but not routed: `changePassword`, `deleteAccount` — see `AUTH_FLOW.md`)*

**Progress** (`/api/progress`, all require login)
- `GET /`, `GET /snapshot`
- `POST /problems/:problemId/attempt`, `POST /problems/:problemId/complete`, `POST /problems/:problemId/uncomplete`
- `POST /topics/:topicId/open`, `POST /topics/:topicId/subtopics/:subtopicId`

**Problems** (`/api/problems`, all require login; writes require `instructor`/`admin`) — ⚠️ **implemented, not yet called by the frontend**
- `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`

**Trainer Board Circuits** (`/api/trainer-board`, all require login) — a separate
breadboard/IC tool from Boolforge; Boolforge circuits are client-side only
- `GET /circuits`, `POST /circuits`, `GET /circuits/:id`, `PUT /circuits/:id`, `DELETE /circuits/:id`

**AI Assistant** (`/api/ai`, its own auth — `requireAiAuth`, not the main login cookie by default)
- `POST /chat`, `POST /chat/stream`, `POST /hint`, `POST /generate-circuit`

**Internal** (`/api/internal`, bearer `CRON_SECRET` only — not for frontend use)
- `GET /run-daily-jobs`, `POST /run-daily-jobs`, `POST /process-email-queue`

## Notes on Implementation Status

- **Problems CRUD is backend-only right now.** The API and its role-gating work, but
  nothing in the frontend calls `/api/problems` yet, so `npm run seed:problems` is
  optional and not part of required setup — see `SETUP_GUIDE.md` and `RBAC_FLOW.md`.
- **`changePassword` and `deleteAccount`** exist as controller functions but aren't
  mounted to any route — see `AUTH_FLOW.md`.
- **RBAC is partially wired up:** the `role` field and `requireRole` middleware exist
  and are enforced on the Problems write routes, but there's no way to assign a
  non-default role short of a direct database edit — see `RBAC_FLOW.md`.

Historical note: earlier revisions of this document flagged a mismatch between where
`authController.js` imports the token helper (`../utils/token`) and where that file
actually lived. That has been resolved — `src/utils/token.js` is present at the
expected path in the current tree, so there's nothing to align before a production release on that front.
