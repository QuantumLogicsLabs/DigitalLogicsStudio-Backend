# Backend Authentication Flow

The backend uses cookie-based JWT sessions. The browser stores the token as an httpOnly cookie, while the frontend only stores sanitized user state in React context.

> **This revision:** mounts `changePassword` and `deleteAccount` (previously implemented
> but not routed) and adds a brand-new `updateProfile` endpoint for display name +
> avatar. The "Implemented in Code, Not Yet Routed" gap called out in earlier revisions
> no longer exists for these three.

## Registration Flow

1. Frontend submits `name`, `email`, and `password` to `POST /api/auth/register`.
2. Controller validates required fields, name length, email format, and password length.
3. Email is trimmed and lowercased.
4. Backend checks for an existing user with the same email.
5. Mongoose creates the user (`role` defaults to `"student"` — there is no way to
   request a different role at signup).
6. `pre("save")` hashes the password with bcrypt.
7. Backend signs a JWT containing `{ userId }`.
8. Backend sets the `token` cookie.
9. A welcome email is enqueued (fire-and-forget — never blocks the response; see
   `EMAIL_NOTIFICATIONS.md`).
10. Backend returns sanitized user data.

## Login Flow

1. Frontend submits `email` and `password` to `POST /api/auth/login`.
2. Backend lowercases the email and fetches the user with `select("+password")`.
3. `matchPassword` compares the submitted password with the bcrypt hash.
4. Backend signs a JWT and sets the auth cookie.
5. Backend returns sanitized user data.

## Session Restore Flow

1. Frontend calls `GET /api/auth/me` on app boot.
2. Browser sends the `token` cookie if CORS and cookie settings allow credentials.
3. `protect` verifies the JWT with `JWT_SECRET`.
4. Backend loads the user by `decoded.userId` (selecting `_id name email createdAt
   solvedProblems notifications role`) and excludes `password`.
5. Backend attaches the user document to `req.user`.
6. Controller returns sanitized user data.

## Logout Flow

1. Frontend calls `POST /api/auth/logout`.
2. Backend clears the `token` cookie using matching cookie options.
3. Frontend clears in-memory auth state.

## Profile Update Flow (Name + Avatar) — Implemented

**`PATCH /api/auth/profile`** — requires `protect`. Body: `{ name?, avatarDataUrl? }`,
at least one required.

1. If `name` is present, it's trimmed and must be 2–60 characters.
2. If `avatarDataUrl` is present:
   - `null` clears the existing photo.
   - Otherwise it must be a string starting with `data:image/` and under ~7MB of
     encoded text (see the size note below).
3. Backend saves the updated fields on `req.user` and returns sanitized user data.

**Body size:** avatars are sent as base64 JSON, which is well over the API's default
10kb body limit — a 5MB image (the frontend's own cap) becomes roughly 6.7MB once
encoded. Rather than loosen the limit API-wide, `src/app.js` mounts a path-scoped
`express.json({ limit: "8mb" })` for `/api/auth/profile` only, ahead of the general
10kb parser. `body-parser` skips re-parsing a request whose body was already consumed,
so every other route is unaffected.

**Storage:** the resulting data URL is stored directly on `User.avatarUrl` (see
`DATABASE_SCHEMA.md`). There's no object storage/CDN wired into this project yet, so
this is a deliberate, documented trade-off for the current scale rather than a gap —
revisit if avatars need to be served to third parties or the `users` collection's
average document size becomes a concern.

## Change Password Flow (While Logged In) — Implemented

**`POST /api/auth/change-password`** — requires `protect`. Body:
`{ currentPassword, newPassword }`. POST (not PATCH) to match the frontend's
`authService.changePassword()`.

1. Validates both fields are present and `newPassword` is at least 8 characters.
2. Rejects if `newPassword === currentPassword`.
3. Re-fetches the user with `+password` (not present on `req.user` from `protect`) and
   verifies `currentPassword` via `matchPassword`.
4. Sets `user.password = newPassword`; the `pre("save")` hook re-hashes it.
5. Returns a success message (no user object needed — nothing else changed).

This is distinct from the unauthenticated OTP-based `forgot-password` flow below, which
exists for users who can't log in at all.

## Delete Account Flow — Implemented

**`DELETE /api/auth/account`** — requires `protect`. Body: `{ password }`, sent as a
DELETE request body (axios `{ data: {...} }`) to match `authService.deleteAccount()`.

1. Requires the current password as confirmation; re-verifies it the same way as
   `change-password`.
2. Cascades: deletes the user's `UserProgress` document, any `EmailQueue` rows tied to
   `userId`, then the `User` document itself — all three in parallel via `Promise.all`.
3. Clears the auth cookie.
4. Returns a success message. Irreversible — there is no soft-delete or grace period.

## Password Reset Flow (OTP-based) — Implemented

Three-step flow, unauthenticated (the user isn't logged in yet, by definition):

1. **`POST /api/auth/forgot-password`** — `{ email }`. Rate-limited (5 requests / 15 min
   per IP via `otpRequestLimiter`). If the account exists, generates a 6-digit OTP,
   stores its SHA-256 hash + a 10-minute expiry on `user.resetPassword`, and emails it
   via `sendPasswordResetOTP`. **Always returns the same 200 message regardless of
   whether the email exists**, to avoid leaking account existence. If the email fails
   to send, the OTP state is rolled back and a `502` is returned instead.
2. **`POST /api/auth/verify-reset-otp`** — `{ email, otp }`. Rate-limited (15 requests /
   15 min via `otpVerifyLimiter`). Checks the OTP hash and expiry, and enforces a max of
   5 incorrect attempts (`MAX_OTP_ATTEMPTS`) before forcing a fresh
   `forgot-password` request. On success, issues a random 32-byte `resetToken`, stores
   its hash + a 15-minute expiry, and returns the **plaintext** `resetToken` to the
   client (it's a bearer-style credential for the next step, not something re-checked
   against a hash on the client side).
3. **`POST /api/auth/reset-password`** — `{ email, resetToken, password }`. Also behind
   `otpVerifyLimiter`. Validates the reset token hash + expiry, sets the new password
   (re-hashed by the `pre("save")` hook), clears all `resetPassword` state, clears the
   auth cookie (forcing a fresh login), and returns success.

Note the naming: this reset-token exchange step is handled by `otpVerifyLimiter` in the
route file, reusing the same limiter instance as OTP verification rather than a
dedicated one.

## Notification Preference Toggle — Implemented

**`PATCH /api/auth/notifications`** — `{ optedOut: boolean }`. Requires `protect`.
Flips `req.user.notifications.optedOut` and saves. Every scheduled/triggered
notification (`sendWelcomeNotification`, `checkMilestones`, `runInactivityCheck`,
`runWeeklyDigest`) checks this flag before enqueueing anything. See
`EMAIL_NOTIFICATIONS.md`.

## Cookie Settings

Development:

```js
{
  httpOnly: true,
  secure: false,
  sameSite: "lax"
}
```

Production:

```js
{
  httpOnly: true,
  secure: true,
  sameSite: "none"
}
```

Production uses `sameSite: "none"` because the frontend and backend may be deployed on different domains.

## Security Properties

- JavaScript cannot read the token because the cookie is httpOnly.
- HTTPS is required for production cookie delivery.
- The backend never returns password hashes or reset-token/OTP hashes.
- Invalid, missing, expired, or orphaned tokens return `401`.
- The forgot-password endpoint returns an identical response whether or not the email
  exists, and OTP verification is capped at 5 attempts before requiring a new code.
- `change-password` and `delete-account` both re-verify the current password
  server-side even though the request is already authenticated — a valid session cookie
  alone isn't treated as sufficient proof of intent for these two actions.

## Operational Requirements

- `JWT_SECRET` must be long, random, and unique per environment.
- Rotating `JWT_SECRET` invalidates all active sessions.
- Frontend requests must use `withCredentials: true`.
- Backend CORS must allow the exact frontend origin.
- `GMAIL_USER` / `GMAIL_APP_PASSWORD` must be configured for the password-reset OTP
  email (and all other notification emails) to actually send — see `.env.example`.

## Known Improvement Areas

- Add login rate limiting (currently only the OTP routes are rate-limited; register/login are not).
- Add account lockout or progressive delay after repeated failures.
- Add email verification before enabling sensitive actions.
- Add a way to change `role` (see `RBAC_FLOW.md`) if RBAC is going to be used for anything beyond the current Problems write-gate.
- Add CSRF protection if adding state-changing cookie-authenticated browser forms outside the current JSON API pattern.
- Move avatar storage off the `User` document and into object storage/a CDN if avatar
  size or `users` collection growth becomes a real concern — see "Profile Update Flow"
  above.
