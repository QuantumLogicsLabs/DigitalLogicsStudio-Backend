# Backend Folder Structure

> **This revision replaces the previous tree**, which only listed a partial `src/`
> (missing `ai/`, most of `models`/`controllers`/`routes`, and the whole `scripts/`
> directory) and repeated a token-helper path warning that no longer applies.

```text
backend/
|-- docs/
|-- node_modules/
|-- scripts/
|   |-- seedData/
|   |   `-- problems.json
|   |-- migrateProgress.js
|   `-- seedProblems.js
|-- src/
|   |-- ai/
|   |   |-- config/
|   |   |-- controllers/
|   |   |-- middleware/
|   |   |-- prompts/
|   |   `-- services/
|   |-- config/
|   |-- controllers/
|   |-- middleware/
|   |-- models/
|   |-- routes/
|   |-- services/
|   |-- utils/
|   `-- app.js
|-- test/
|-- .env.example
|-- package.json
|-- package-lock.json
|-- server.js
`-- vercel.json
```

## Root Files

### `server.js`

Process entrypoint. It loads environment variables, validates required configuration, connects to MongoDB in development, and exports a Vercel serverless handler in production. Also force-sets DNS resolvers (`8.8.8.8`, `8.8.4.4`, `1.1.1.1`) to work around router DNS blocking MongoDB Atlas SRV lookups, and starts `startLocalScheduler()` in non-production.

### `package.json`

Defines scripts and dependencies:

- `npm run dev`: starts `nodemon server.js`.
- `npm start`: starts `node server.js`.
- `npm run seed:problems`: runs `scripts/seedProblems.js` — optional, see `SETUP_GUIDE.md`.

### `.env.example`

Tracks required configuration names without committing secrets.

### `vercel.json`

Deployment configuration for Vercel, including the daily cron that hits
`/api/internal/run-daily-jobs`.

## `scripts/`

Standalone Node scripts, run directly (`node scripts/...`), not part of the Express app.

### `seedProblems.js`

Idempotent upsert of `scripts/seedData/problems.json` into the `Problem` collection.
Optional — see `SETUP_GUIDE.md` (the frontend doesn't consume `/api/problems` yet).

### `migrateProgress.js`

One-time migration of legacy embedded progress fields off `User` documents into the
`UserProgress` collection. Supports `--write` (actually writes) and `--write --cleanup`
(also strips the old embedded fields afterward). Safe to re-run. Not needed on a fresh
database that never had the old embedded shape.

## `src/app.js`

Express application composition:

- Body parsing with `10kb` limits.
- Cookie parsing.
- Compression.
- CORS allowlist.
- Security headers.
- Swagger docs.
- API route mounting (`/api/health`, `/api/auth`, `/api/progress`, `/api/ai`,
  `/api/internal`, `/api/trainer-board`, `/api/problems`).
- 404 and centralized error handling.

## `src/config`

### `db.js`

Connects Mongoose to `MONGO_URI`. Also runs `cleanupStaleUserIndexes()` on connect,
which drops any leftover legacy `username` index on the `users` collection.

### `swagger.js`

Defines OpenAPI metadata, servers, shared component schemas (`User`, `Problem`,
`ProblemInput`, `ProgressState`, etc.), the `bearerAuth` security scheme (used by
`/api/internal/*`), and route annotation discovery (`./src/routes/*.js`).

## `src/controllers`

Controllers own request validation and domain orchestration.

### `authController.js`

Registration, login, logout, current-user, password reset (OTP), and notification
preference toggle. Also exports `changePassword` and `deleteAccount`, which are
implemented but **not currently mounted to any route** — see `AUTH_FLOW.md`.

### `progressController.js`

Handles problem attempts, solve/unsolve actions, topic open events, subtopic toggles, and snapshot hydration. Operates on `req.progress` (attached by `loadUserProgress`), not on the `User` document.

### `problemController.js`

CRUD for the `Problem` catalog. Read routes require only authentication; write routes
additionally require `instructor`/`admin` via `requireRole`. **Not yet called by the
frontend** — see `RBAC_FLOW.md`.

### `circuitController.js`

CRUD for `SavedCircuit` documents ("Trainer Board" breadboard circuits), scoped to
`req.user._id`. Distinct from Boolforge, which saves/loads client-side only.

## `src/ai`

Separate sub-tree for the AI assistant surface, kept apart from the main
controllers/routes because it has its own auth and rate-limiting model.

- `config/groq.js`, `config/pinecone.js` — lazily-constructed clients, `null` if the
  relevant API key env var isn't set.
- `controllers/chatController.js` — `POST /api/ai/chat` and `/chat/stream` (SSE).
- `controllers/hintController.js` — `POST /api/ai/hint`, proxies to an external
  CircuitMind API with an internal Groq fallback.
- `controllers/generateCircuitController.js` — `POST /api/ai/generate-circuit`, with a
  three-tier fallback: external CircuitMind API → local truth-table synthesizer → Groq.
- `middleware/aiAuth.js` — accepts either an `Authorization: Bearer` JWT or the same
  auth cookie; allows unauthenticated local-dev requests only when `NODE_ENV !==
  "production"` and the request looks like it's from localhost.
- `middleware/aiRateLimit.js` — per-user (or per-IP if unauthenticated) rate limiting.
- `prompts/systemPrompt.js` — builds the DLS Mentor system prompt from a hardcoded DLD +
  COAL curriculum outline and the student's session context.
- `services/retrieval.js` — optional Pinecone RAG lookup, no-ops if
  `PINECONE_API_KEY` isn't set.

## `src/middleware`

### `authMiddleware.js`

Exports both `protect` (verifies cookie JWT, attaches `req.user`) and `requireRole`
(role-gate, currently only used by `problemRoutes.js`).

### `errorMiddleware.js`

Normalizes 404 and thrown errors into JSON responses.

### `internalAuth.js`

Guards `/api/internal/*` with a static bearer token compared against `CRON_SECRET` —
unrelated to `protect`/user sessions.

### `loadUserProgress.js`

Attaches `req.progress` (the user's `UserProgress` doc, created on first access). Only
applied to the progress router, so other routes don't pay for the extra query.

## `src/models`

### `User.js`

Auth fields, `role`, `resetPassword` state, `notifications` state, and the legacy
`solvedProblems` array. No longer holds progress arrays — see `UserProgress.js`.

### `UserProgress.js`

`problemProgress`, `topicProgress`, `activityLog`, `recentEvents` — one document per user.

### `Problem.js`

The problem catalog schema — see `DATABASE_SCHEMA.md`.

### `SavedCircuit.js`

The Trainer Board circuit schema (`wires`, `placedICs`, `switches`, `clkHz`, `clkOn`) —
see `DATABASE_SCHEMA.md`. Not Boolforge's format.

### `EmailQueue.js`

Durable queue backing the notification system — see `EMAIL_NOTIFICATIONS.md`.

## `src/routes`

Routes map HTTP paths to controllers. All route files under `src/routes/*.js` are
scanned by `swagger-jsdoc` for `@swagger` JSDoc blocks.

| File | Mounted at | Auth |
| --- | --- | --- |
| `healthRoutes.js` | `/api/health` | none |
| `authRoutes.js` | `/api/auth` | mixed (register/login public; `/me` and `/notifications` require `protect`) |
| `progressRoutes.js` | `/api/progress` | `protect` + `loadUserProgress` on every route |
| `problemRoutes.js` | `/api/problems` | `protect` on all; `requireRole("instructor","admin")` on writes |
| `circuitRoutes.js` | `/api/trainer-board` | `protect` on all |
| `aiRoutes.js` | `/api/ai` | `requireAiAuth` + `aiChatRateLimiter` on all |
| `internalRoutes.js` | `/api/internal` | `internalAuth` (bearer `CRON_SECRET`) on all |

## `src/services`

### `emailQueueService.js`

`enqueueEmail`, `enqueueAndSend` (write + immediate send attempt), `processQueueItem`,
`processPendingEmails` (batch retry with 1/5/15-minute backoff).

### `notificationService.js`

Trigger logic for all four notification types — see `EMAIL_NOTIFICATIONS.md`.

### `scheduler.js`

`startLocalScheduler()` — local-dev-only polling (queue retry every minute,
digest/inactivity checks hourly). Not used in production; production relies on Vercel
Cron hitting `/api/internal/run-daily-jobs` once daily.

## `src/utils`

### `token.js`

JWT generation and cookie option helpers (`generateToken`, `setAuthCookie`,
`clearAuthCookie`, `assertAuthConfig`). Imported by `authController.js` as
`../utils/token` — this matches the actual file location; there is no path mismatch in
the current tree.

### `email.js`

Nodemailer transporter (`getTransporter`) plus HTML/text builders for every email type
sent by the backend (password-reset OTP, welcome, milestone, weekly digest, inactivity).

### `otp.js`

OTP generation, hashing, and reset-token generation helpers used by the password-reset flow.

### `httpError.js`

`createHttpError(statusCode, message)` — the error shape thrown throughout controllers
and normalized by `errorMiddleware.js`.
