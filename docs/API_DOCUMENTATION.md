# Backend API Documentation

Base URL:

- Local: `http://localhost:5000`
- Production: configured deployment domain

All API responses are JSON. Successful responses include `success: true`; errors include `success: false` and `message`.

> **This revision adds** the password-reset flow, notification toggle, Problems CRUD,
> Trainer Board circuits, AI assistant, and Internal endpoint groups, none of which were
> documented here before even though they're implemented. It also flags which of these
> are actually used by the frontend today.
>
> **Update:** `PATCH /api/auth/profile`, `PATCH /api/auth/change-password`, and
> `POST /api/auth/delete-account` are now implemented **and** routed — they previously
> existed only as unmounted controller functions (`changePassword`/`deleteAccount`) or
> didn't exist at all (`updateProfile`). See "Auth Endpoints" below.
>
> For the generated, always-current version of this reference, use Swagger at
> `/api/docs`.

## Authentication Model

Most of the API (auth, progress, problems, trainer-board) uses an httpOnly cookie named
`token`. The frontend must call the API with credentials enabled:

```js
axios.create({
  baseURL: process.env.REACT_APP_API_URL,
  withCredentials: true
});
```

Do not send JWTs through localStorage or manually attach bearer tokens unless the auth model is intentionally changed.

**Two exceptions to this cookie model:**
- `/api/ai/*` — accepts either the same `token` cookie *or* an `Authorization: Bearer
  <jwt>` header, checked via its own `requireAiAuth` middleware (not `protect`). It also
  allows unauthenticated requests when `NODE_ENV !== "production"` and the request looks
  like it's coming from localhost.
- `/api/internal/*` — ignores the login cookie entirely. Requires
  `Authorization: Bearer <CRON_SECRET>`, checked by `internalAuth`. This group is for
  the Vercel Cron job (and manual ops calls), not the frontend.

## Health

### `GET /`

Returns a service status message.

```json
{
  "success": true,
  "message": "Digital Logics Studio backend is running."
}
```

### `GET /api/health`

Returns API health and environment, plus whether the optional AI providers are configured.

```json
{
  "success": true,
  "message": "API is healthy",
  "environment": "development",
  "ai": {
    "groqConfigured": true,
    "pineconeConfigured": false
  }
}
```

## Auth Endpoints

### `POST /api/auth/register`

Creates a user, hashes the password, sets the auth cookie, enqueues a welcome email, and returns sanitized user data.

Request:

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "correcthorse"
}
```

Response `201`:

```json
{
  "success": true,
  "message": "Account created successfully.",
  "user": {
    "id": "664f1a2b3c4d5e6f7a8b9c0d",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "role": "student",
    "avatarUrl": null,
    "solvedProblems": [],
    "createdAt": "2026-05-29T10:00:00.000Z",
    "emailNotificationsOptedOut": false
  }
}
```

Validation:

- `name` required, minimum 2 characters.
- `email` required and normalized to lowercase.
- `password` required, minimum 8 characters.
- Duplicate email returns `409`.
- `role` is always `"student"` on registration — there is no field for requesting a different role.

### `POST /api/auth/login`

Verifies credentials, sets the auth cookie, and returns sanitized user data.

Request:

```json
{
  "email": "ada@example.com",
  "password": "correcthorse"
}
```

Response `200`:

```json
{
  "success": true,
  "message": "Welcome back, Ada Lovelace.",
  "user": {
    "id": "664f1a2b3c4d5e6f7a8b9c0d",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "role": "student",
    "avatarUrl": null,
    "solvedProblems": [1, 7],
    "createdAt": "2026-05-29T10:00:00.000Z",
    "emailNotificationsOptedOut": false
  }
}
```

### `POST /api/auth/logout`

Clears the auth cookie.

Response `200`:

```json
{
  "success": true,
  "message": "Logged out successfully."
}
```

### `GET /api/auth/me`

Requires a valid auth cookie.

Response `200`:

```json
{
  "success": true,
  "user": {
    "id": "664f1a2b3c4d5e6f7a8b9c0d",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "role": "student",
    "avatarUrl": null,
    "solvedProblems": [1, 7],
    "createdAt": "2026-05-29T10:00:00.000Z",
    "emailNotificationsOptedOut": false
  }
}
```

Unauthorized response `401`:

```json
{
  "success": false,
  "message": "Not authorized. Please log in."
}
```

### `PATCH /api/auth/profile` — Implemented

Requires `protect`. Updates the display name and/or avatar for the logged-in user. At
least one of `name` / `avatarDataUrl` must be present.

Request:

```json
{
  "name": "Ada Byron",
  "avatarDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANS..."
}
```

Send `"avatarDataUrl": null` to remove an existing photo without changing the name.

Response `200`:

```json
{
  "success": true,
  "message": "Profile updated.",
  "user": { "...": "sanitized user, same shape as /me" }
}
```

Validation:

- `name`, if present, must be 2–60 characters after trimming.
- `avatarDataUrl`, if present and non-null, must start with `data:image/` and be under
  roughly 7MB of encoded text (the frontend itself caps the source file at 5MB, which
  becomes ~6.7MB once base64-encoded).
- **Body size:** this route is mounted with an 8MB JSON limit instead of the API's usual
  10kb limit — see `src/app.js`. Every other route keeps the strict default. A payload
  over 8MB gets a `413` from the body parser before it reaches validation.
- Avatars are stored inline on the `User` document as a data URL (no object storage/CDN
  is wired up yet) — a pragmatic choice at current traffic levels, not a permanent
  architecture decision. See `DATABASE_SCHEMA.md`.

### `POST /api/auth/change-password` — Implemented

Requires `protect`. Distinct from the OTP-based `/forgot-password` flow below — this is
for a user who is already logged in and knows their current password. POST rather than
PATCH to match `authService.changePassword()` on the frontend.

Request: `{ "currentPassword": "correcthorse", "newPassword": "newSecret123" }`

Response `200`:

```json
{
  "success": true,
  "message": "Password updated successfully."
}
```

Error `400`: missing fields, new password under 8 characters, or new password identical
to the current one.
Error `401`: not authenticated, or `currentPassword` doesn't match.

### `DELETE /api/auth/account` — Implemented

Requires `protect` and password confirmation. Cascades: deletes the user's
`UserProgress` document and any `EmailQueue` rows referencing them, deletes the `User`
document, then clears the auth cookie. Irreversible. `DELETE /account` rather than
`POST /delete-account` to match `authService.deleteAccount()`, which sends the password
in the DELETE request body via axios's `{ data: {...} }` option.

Request: `{ "password": "correcthorse" }`

Response `200`:

```json
{
  "success": true,
  "message": "Your account and all associated data have been deleted."
}
```

Error `400`: missing password.
Error `401`: not authenticated, or password incorrect.

### `POST /api/auth/forgot-password` — Implemented

Rate-limited: 5 requests / 15 minutes per IP. Always returns the same message whether
or not the email exists (avoids leaking account existence).

Request: `{ "email": "ada@example.com" }`

Response `200`:

```json
{
  "success": true,
  "message": "If an account exists for that email, a verification code has been sent."
}
```

### `POST /api/auth/verify-reset-otp` — Implemented

Rate-limited: 15 requests / 15 minutes per IP. Max 5 incorrect OTP attempts before the
code is invalidated and a new `forgot-password` call is required.

Request: `{ "email": "ada@example.com", "otp": "123456" }`

Response `200`:

```json
{
  "success": true,
  "message": "Code verified. You can now set a new password.",
  "resetToken": "9f2c...a13"
}
```

Error `400`: `{ "success": false, "message": "Invalid or expired verification code." }`
Error `429`: `{ "success": false, "message": "Too many incorrect attempts. Please request a new verification code." }`

### `POST /api/auth/reset-password` — Implemented

Request: `{ "email": "ada@example.com", "resetToken": "9f2c...a13", "password": "newSecret123" }`

Response `200`:

```json
{
  "success": true,
  "message": "Password reset successfully. Please log in with your new password."
}
```

Also clears the current auth cookie, so the client must log in again afterward.

### `PATCH /api/auth/notifications` — Implemented

Requires `protect`.

Request: `{ "optedOut": true }`

Response `200`:

```json
{
  "success": true,
  "message": "You've been unsubscribed from email notifications.",
  "user": { "...": "sanitized user, same shape as /me" }
}
```

## Progress Endpoints

All progress routes require authentication.

### `GET /api/progress` and `GET /api/progress/snapshot`

Returns the complete progress state used by the frontend.

```json
{
  "success": true,
  "state": {
    "problems": {
      "5": {
        "attempts": 2,
        "status": "solved",
        "openedAt": "2026-05-29T10:00:00.000Z",
        "lastAttemptAt": "2026-05-29T10:05:00.000Z",
        "solvedAt": "2026-05-29T10:05:00.000Z",
        "title": "Half Adder",
        "tags": ["Combinational", "Arithmetic"],
        "topicId": "arithmetic",
        "subject": "dld"
      }
    },
    "topics": {},
    "activity": {},
    "recentEvents": []
  }
}
```

### `POST /api/progress/problems/:problemId/attempt`

Records an attempt and increments daily activity.

Request:

```json
{
  "title": "Half Adder",
  "tags": ["Combinational", "Arithmetic"],
  "topicId": "arithmetic",
  "subject": "dld"
}
```

Response:

```json
{
  "success": true,
  "message": "Attempt recorded."
}
```

### `POST /api/progress/problems/:problemId/complete`

Marks a problem as solved. This operation is idempotent for daily solved counts, and
also triggers `checkMilestones` (may enqueue a milestone email — see
`EMAIL_NOTIFICATIONS.md`).

Request: same shape as `attempt`, plus optional `subject`.

Response:

```json
{
  "success": true,
  "message": "Problem marked as completed.",
  "user": {
    "id": "664f1a2b3c4d5e6f7a8b9c0d",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "role": "student",
    "solvedProblems": [5],
    "createdAt": "2026-05-29T10:00:00.000Z"
  }
}
```

### `POST /api/progress/problems/:problemId/uncomplete`

Removes a problem from solved state.

Response:

```json
{
  "success": true,
  "message": "Problem un-marked.",
  "user": {
    "id": "664f1a2b3c4d5e6f7a8b9c0d",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "role": "student",
    "solvedProblems": [],
    "createdAt": "2026-05-29T10:00:00.000Z"
  }
}
```

### `POST /api/progress/topics/:topicId/open`

Marks a topic as opened and stores total subtopic count.

Request:

```json
{
  "title": "Boolean Algebra",
  "totalSubtopics": 8,
  "subject": "dld"
}
```

### `POST /api/progress/topics/:topicId/subtopics/:subtopicId`

Toggles a subtopic completion state.

Request:

```json
{
  "title": "Boolean Algebra",
  "totalSubtopics": 8,
  "subject": "dld",
  "equivalentSubtopicIds": ["boolean-laws-legacy"]
}
```

Response:

```json
{
  "success": true,
  "message": "Subtopic toggled.",
  "topicProgress": {
    "topicId": "boolean-algebra",
    "title": "Boolean Algebra",
    "status": "in_progress",
    "completionPercentage": 13,
    "completedSubtopics": ["boolean-laws"],
    "totalSubtopics": 8,
    "subject": "dld"
  }
}
```

## Problems Endpoints — ⚠️ Implemented, Not Yet Called by the Frontend

All require `protect`; `POST`/`PUT`/`DELETE` additionally require
`requireRole("instructor", "admin")` (see `RBAC_FLOW.md` for how to actually get a
non-`student` role today — currently a manual DB edit).

### `GET /api/problems`

Response: `{ "success": true, "problems": [ { "...": "Problem, see DATABASE_SCHEMA.md" } ] }`

### `GET /api/problems/:id`

`:id` is the numeric problem id. `404` if not found.

### `POST /api/problems`

Body must include a not-already-used numeric `id`, `title`, `difficulty`
(`Easy`/`Medium`/`Hard`), `course` (`dld`/`coal`), non-empty `inputs`/`outputs` arrays,
and either an empty `truthTable` or one with exactly `2^inputs.length` rows whose keys
exactly match `inputs`+`outputs`. Returns `201` with the created problem, `409` if the
id is taken.

### `PUT /api/problems/:id`

Same body shape as create; the path `:id` wins over any `id` in the body.

### `DELETE /api/problems/:id`

Returns `{ "success": true, "message": "Problem deleted." }`.

## Trainer Board Circuits (`/api/trainer-board`)

All require `protect`. This is a **separate breadboard/IC tool from Boolforge** —
Boolforge's own gate-graph circuits are saved client-side (browser `localStorage` +
JSON export/import) and never hit this API.

### `GET /api/trainer-board/circuits`

Lists the authenticated user's saved circuits as lightweight summaries (no
`wires`/`placedICs` payload).

### `POST /api/trainer-board/circuits`

Body: `{ name?, wires?, placedICs?, switches?, clkHz?, clkOn? }` — see
`DATABASE_SCHEMA.md` for the sub-document shapes. Returns `201` with the full saved
circuit.

### `GET /api/trainer-board/circuits/:id`

Full circuit including `wires`/`placedICs`. `404` if not found or not owned by the
requesting user.

### `PUT /api/trainer-board/circuits/:id`

Overwrites an existing circuit owned by the user. Same body shape as create.

### `DELETE /api/trainer-board/circuits/:id`

Deletes a circuit owned by the user.

## AI Assistant Endpoints (`/api/ai`)

Auth: `requireAiAuth` (Bearer JWT or the same cookie; unauthenticated allowed only in
non-production from a localhost-looking request). Rate-limited per-user (or per-IP if
unauthenticated) via `aiChatRateLimiter`.

### `POST /api/ai/chat`

Body: `{ "message": string, "context"?: object }`. Returns the full generated reply in
one response. `503` if `GROQ_API_KEY` isn't configured.

### `POST /api/ai/chat/stream`

Same body as `/chat`, but streams the reply as Server-Sent Events
(`data: {"token": "..."}` chunks, ending with `data: {"done": true}`).

### `POST /api/ai/hint`

Body: `{ problem_title?, problem_description?, inputs?, outputs?, truth_table?, gates?,
wires?, last_result? }`. Tries an external CircuitMind API first, falls back to an
internal Groq-generated hint. Returns `{ reply, hint, source }`.

### `POST /api/ai/generate-circuit`

Body: `{ prompt?, problem_title?, problem_description?, inputs?, outputs?, truthTable? }`.
Three-tier fallback: external CircuitMind API → local truth-table synthesizer (if
`inputs`/`outputs`/`truthTable` are all present) → Groq-generated gate JSON. Returns
`{ status, circuit_name, gates, wires, source }`.

## Internal Endpoints (`/api/internal`) — Ops Only, Not Frontend-Facing

Auth: `Authorization: Bearer <CRON_SECRET>` via `internalAuth`. Vercel Cron sends this
automatically once `CRON_SECRET` is set as an env var on the project.

### `GET /api/internal/run-daily-jobs` and `POST /api/internal/run-daily-jobs`

Runs the email queue retry, inactivity check, and weekly digest in sequence. This is
what the Vercel Cron entry in `vercel.json` hits once a day. All three sub-jobs are
idempotent per-user, so calling this more or less often than daily is harmless.

Response:

```json
{
  "success": true,
  "queue": { "processed": 3, "sent": 2, "failed": 0, "stillPending": 1 },
  "inactivity": { "checked": 40, "sent": 5 },
  "digest": { "checked": 40, "sent": 12 }
}
```

### `POST /api/internal/process-email-queue`

Narrower endpoint — only retries the email queue, skipping the inactivity check and
digest.

## Error Responses

Development errors include `stack`; production errors do not.

```json
{
  "success": false,
  "message": "Route not found: /missing"
}
```
