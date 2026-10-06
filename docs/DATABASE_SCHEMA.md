# Backend Database Schema

> **Corrections in this revision:** the previous "Circuit Collection" section described
> a shape (`gates`/`wires` with gate `type`/`inputs`/`hasOutput`) that does not match the
> actual model. The real `SavedCircuit` model persists a different tool — a breadboard/IC
> "Trainer Board" (wires between named pins + placed IC parts), not Boolforge's gate-graph
> circuits. Boolforge's own save/load (`SaveAndLoad.jsx`) is client-side only — browser
> `localStorage` plus JSON file export/import — and is **not** persisted through this
> backend at all. This revision also adds the `Problem`, `UserProgress`, and `EmailQueue`
> collections, which exist in the codebase but weren't documented before.
>
> **Update:** `User` gained an `avatarUrl` field, written by the newly-mounted
> `PATCH /api/auth/profile` endpoint — see "User Collection" below and `AUTH_FLOW.md`.

The backend uses five MongoDB collections: `users`, `userprogresses`, `problems`,
`savedcircuits`, and `emailqueues`.

## User Collection

Mongoose model: `src/models/User.js`

Progress data used to be embedded here. It has since moved to its own `UserProgress`
collection (see below) so that `protect` doesn't have to load it on every authenticated
request — the schema below is the *current*, slimmed-down shape.

```js
{
  name: String,
  email: String,
  password: String,          // select: false
  role: String,               // "student" | "instructor" | "admin", default "student"
  avatarUrl: String,          // base64 data URL, or null — see note below
  solvedProblems: [Number],   // legacy flat array, kept for compatibility
  resetPassword: {            // all fields select: false
    otpHash: String,
    otpExpires: Date,
    otpAttempts: Number,
    tokenHash: String,
    tokenExpires: Date,
  },
  notifications: {
    milestonesSent: [Number],
    lastDigestSentAt: Date,
    lastInactivityReminderAt: Date,
    optedOut: Boolean,
  },
  createdAt: Date,
  updatedAt: Date,
}
```

## User Fields

| Field | Type | Rules |
| --- | --- | --- |
| `name` | String | Required, trimmed, 2 to 60 characters. |
| `email` | String | Required, unique, trimmed, lowercase. |
| `password` | String | Required, min 8, excluded by default with `select: false`. |
| `role` | String | Enum `student`/`instructor`/`admin`, defaults to `student`. No route currently changes it — see `RBAC_FLOW.md`. |
| `avatarUrl` | String \| null | Base64 `data:image/...` URL, or `null`. Written only by `PATCH /api/auth/profile`, capped at ~7MB of encoded text server-side. Stored inline rather than in object storage/a CDN — see "Avatar Storage" note below. |
| `solvedProblems` | Number array | Legacy flat array kept for compatibility with frontend auth state. |
| `resetPassword.*` | — | OTP hash/expiry/attempts and reset-token hash/expiry for the forgot-password flow. All `select: false`. |
| `notifications.*` | — | Idempotency guards + opt-out flag for the email notification system (see `EMAIL_NOTIFICATIONS.md`). |

### Avatar Storage Note

There is no file-storage/CDN integration in this project. Storing a base64 image
directly on the `User` document is a pragmatic choice for the current traffic level
(<10 visitors/hour per `EMAIL_NOTIFICATIONS.md`), not a long-term architecture decision.
If this ever needs to change: move to object storage (S3/R2/Cloudinary/etc.), store only
a URL on `avatarUrl`, and drop the inline 8MB body-size carve-out in `src/app.js` for
`/api/auth/profile` since uploads would then go straight to the storage provider.

## Password Storage

Passwords are never stored in plaintext. A `pre("save")` hook hashes modified passwords with bcrypt before persistence. Credential checks use the model method `matchPassword`.

---

## UserProgress Collection

Mongoose model: `src/models/UserProgress.js`

One document per user, linked via `userId`. This is where `problemProgress`,
`topicProgress`, `activityLog`, and `recentEvents` actually live now (they are **not**
on the `User` document, despite some earlier documentation implying an embedded model).

```js
{
  userId: ObjectId,           // ref → User, unique
  problemProgress: [ProblemProgress],
  topicProgress: [TopicProgress],
  activityLog: [ActivityDay],
  recentEvents: [RecentEvent],
  createdAt: Date,
  updatedAt: Date,
}
```

### ProblemProgress

```js
{
  problemId: Number,
  title: String,
  tags: [String],
  topicId: String | null,
  subject: "dld" | "coal",     // defaults to "dld"
  status: "not_started" | "attempted" | "solved",
  attempts: Number,
  openedAt: Date | null,
  lastAttemptAt: Date | null,
  solvedAt: Date | null,
}
```

### TopicProgress

```js
{
  topicId: String,
  title: String,
  subject: "dld" | "coal",
  status: "not_started" | "in_progress" | "completed",
  openedAt: Date | null,
  completedAt: Date | null,
  completionPercentage: Number,
  completedSubtopics: [String],
  totalSubtopics: Number,
}
```

### ActivityDay

```js
{
  dateKey: "YYYY-MM-DD",
  attempts: Number,
  solved: Number,
  topicsCompleted: Number,
  topicsOpened: Number,
}
```

### RecentEvent

```js
{
  id: String,
  type: String,
  createdAt: Date,
  problemId: Number | null,
  topicId: String | null,
  subtopicId: String | null,
  title: String,
}
```

Capped at 30 entries (`pushRecentEvent` slices the array after unshifting).

### Migration Note

`scripts/migrateProgress.js` is a one-time script for moving old embedded
`problemProgress`/`topicProgress`/`activityLog`/`recentEvents` off legacy `User`
documents into `UserProgress`. It's safe to re-run (skips users that already have a
`UserProgress` doc) and supports `--write` and `--write --cleanup` flags. If you're
setting up fresh (no pre-migration data), you don't need to run this.

---

## Problem Collection

Mongoose model: `src/models/Problem.js`

```js
{
  id: Number,              // unique, numeric — the frontend-facing problem id
  listId: String,          // unique, e.g. "DLD-0005"
  course: "dld" | "coal",
  title: String,           // max 120 chars
  difficulty: "Easy" | "Medium" | "Hard",
  tags: [String],
  topic: String,
  description: String,
  truthTable: [Mixed],     // array of {inputName/outputName: 0|1} rows; [] allowed
  equations: [String],
  hint: String,
  inputs: [String],        // required, non-empty
  outputs: [String],       // required, non-empty
  createdBy: ObjectId,     // ref → User
  updatedBy: ObjectId,     // ref → User
  createdAt: Date,
  updatedAt: Date,
}
```

**Implementation status:** this collection and its full CRUD API (`/api/problems/*`,
gated by `instructor`/`admin` for writes — see `RBAC_FLOW.md`) exist and work, but
**the frontend does not call this API yet.** Seeding it (`npm run seed:problems`) is
optional and not required for normal local setup — see `SETUP_GUIDE.md`.

---

## SavedCircuit Collection

Mongoose model: `src/models/SavedCircuit.js`

Each saved circuit is its own document, linked to the user via `userId`. **This is the
"Digital Logic Trainer Board" (breadboard + IC parts) tool, not Boolforge.** Boolforge's
own circuits (gate graphs) are saved/loaded entirely client-side — browser
`localStorage` plus JSON export/import in `SaveAndLoad.jsx` — and never touch this
collection or this API.

```js
{
  userId: ObjectId,          // ref → User, required
  name: String,              // trimmed, max 80 chars, default "Untitled Circuit"
  wires: [Wire],
  placedICs: [PlacedIC],
  switches: [Number],        // length-8 array of 0/1, default all-0
  clkHz: Number,              // default 1
  clkOn: Boolean,              // default true
  createdAt: Date,
  updatedAt: Date,
}
```

### Wire sub-document

```js
{
  id: Mixed,
  from: String,     // required — breadboard pin/node identifier
  to: String,        // required
  ax: Number, ay: Number,   // optional endpoint coordinates
  bx: Number, by: Number,
  color: String,
}
```

### PlacedIC sub-document

```js
{
  id: Mixed,
  ic: Mixed,          // required — IC catalog key, e.g. 7400
  x: Number, y: Number,
  col: Number,
}
```

`wires`/`placedICs`/`switches` are intentionally loose (`Mixed`/unvalidated arrays) —
the backend persists this frontend-owned shape verbatim rather than validating it
field-by-field.

### Indexes

```js
db.savedcircuits.createIndex({ userId: 1 });
db.savedcircuits.createIndex({ userId: 1, updatedAt: -1 }); // list, most-recent-first
```

### API Endpoints

All require authentication (`protect`); ownership is enforced via
`SavedCircuit.findOwnedById(id, userId)`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/trainer-board/circuits` | List the authenticated user's saved circuits (summaries only) |
| POST | `/api/trainer-board/circuits` | Save a new circuit |
| GET | `/api/trainer-board/circuits/:id` | Get one full saved circuit |
| PUT | `/api/trainer-board/circuits/:id` | Overwrite an existing saved circuit |
| DELETE | `/api/trainer-board/circuits/:id` | Delete a saved circuit |

There is no unique-name-per-user constraint enforced at the database level (no
compound unique index on `{ userId, name }`) — despite what earlier documentation
implied, duplicate circuit names for the same user are currently allowed.

---

## EmailQueue Collection

Mongoose model: `src/models/EmailQueue.js`

Backs the notification system described in `EMAIL_NOTIFICATIONS.md`. Not
frontend-facing — written and read only by backend services
(`emailQueueService.js`, `notificationService.js`) and the `/api/internal/*` cron
endpoints.

```js
{
  userId: ObjectId | null,   // ref → User
  recipient: String,
  type: "welcome" | "milestone" | "weekly_digest" | "inactivity_reminder",
  subject: String,
  html: String,
  text: String,
  status: "pending" | "sent" | "failed",
  attempts: Number,
  maxAttempts: Number,        // default 3
  lastAttemptAt: Date | null,
  nextAttemptAt: Date,        // default now — backoff scheduling
  lastError: String | null,
  sentAt: Date | null,
  meta: Mixed,                 // e.g. { milestone: 25 }
  createdAt: Date,
  updatedAt: Date,
}
```

### Indexes

```js
db.emailqueues.createIndex({ status: 1, nextAttemptAt: 1 }); // used by the retry worker
```

---

## Indexes and Constraints Summary

```js
db.users.createIndex({ email: 1 }, { unique: true });
db.userprogresses.createIndex({ userId: 1 }, { unique: true });
db.problems.createIndex({ id: 1 }, { unique: true });
db.problems.createIndex({ listId: 1 }, { unique: true });
db.savedcircuits.createIndex({ userId: 1 });
db.savedcircuits.createIndex({ userId: 1, updatedAt: -1 });
db.emailqueues.createIndex({ status: 1, nextAttemptAt: 1 });
```

## Data Integrity Practices

- Normalize emails before user creation and login.
- Use model helpers (`getProblemProgress`, `getTopicProgress`, `getActivityDay`,
  `pushRecentEvent` on `UserProgress`) to initialize/update progress entries instead of
  building objects by hand in controllers.
- Keep response sanitization centralized so `password` and reset-token fields never
  leave the API (see `sanitizeUser()` in `authController.js`).
- Keep progress writes idempotent where user actions may be retried (`completeProblem`
  checks `wasSolved` before re-incrementing counters).
- Use `scripts/migrateProgress.js` for the embedded-to-`UserProgress` migration on any
  database that predates the split; skip it on a fresh database.
