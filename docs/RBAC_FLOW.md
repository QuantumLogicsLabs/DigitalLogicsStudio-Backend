# Backend RBAC Flow

## Current Authorization Model

> **Correction (this revision):** earlier versions of this document said no `role` field
> existed yet. That is no longer accurate — `role` is defined on the `User` schema and
> `requireRole` middleware is implemented and actively enforced on part of the API. The
> sections below describe what is actually wired up today, not a future plan.

The backend has two authorization levels, driven by `User.role`:

```js
// src/models/User.js
role: {
  type: String,
  enum: ["student", "instructor", "admin"],
  default: "student",
}
```

- Every user is created with `role: "student"` (see `registerUser` in
  `authController.js` — there is no way to request a different role at signup).
- `role` is included in the fields `protect` selects onto `req.user`
  (`AUTH_SELECT_FIELDS` in `authMiddleware.js`), and is returned by
  `sanitizeUser()` on login/register/`/me` responses.
- **There is currently no route or admin UI to change a user's role.** Promoting
  someone to `instructor` or `admin` requires a direct database edit. This is the
  main gap between "the schema supports RBAC" and "RBAC is operable."

## What Is Actually Role-Gated Today

Only one route file uses `requireRole`: **`problemRoutes.js`**.

| Route | Guard |
| --- | --- |
| `GET /api/problems` | `protect` only — any authenticated user (any role) |
| `GET /api/problems/:id` | `protect` only — any authenticated user (any role) |
| `POST /api/problems` | `protect` + `requireRole("instructor", "admin")` |
| `PUT /api/problems/:id` | `protect` + `requireRole("instructor", "admin")` |
| `DELETE /api/problems/:id` | `protect` + `requireRole("instructor", "admin")` |

Everything else in the API (`auth`, `progress`, `ai`, `trainer-board` circuits) only
checks `protect` (i.e. "is this a logged-in user") and does not look at `role` at all.
`/api/internal/*` uses a separate mechanism entirely — a static bearer token compared
against `CRON_SECRET`, unrelated to user roles.

There is **no `/api/admin` route prefix** and no content-management or user-management
surface yet. `requireRole` exists as reusable middleware but is currently only
protecting the Problems write endpoints — and per `SETUP_GUIDE.md` / the Problems
Swagger docs, those endpoints aren't called by the frontend yet either, so in practice
the only way to exercise this guard right now is by calling the API directly (Swagger UI,
curl, etc.) as a manually-promoted `instructor`/`admin` user.

## Current Guard Implementation

```js
// src/middleware/authMiddleware.js
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(createHttpError(403, "You do not have permission to perform this action."));
    }
    next();
  };
}
```

Usage (as actually written in `problemRoutes.js`):

```js
router.use(protect);
router.post("/", requireRole("instructor", "admin"), createProblem);
router.put("/:id", requireRole("instructor", "admin"), updateProblem);
router.delete("/:id", requireRole("instructor", "admin"), deleteProblem);
```

## Recommended Next Steps (Not Yet Implemented)

To make RBAC operable rather than schema-only:

- Add a way to assign `role` — at minimum a manual admin script; ideally an
  `/api/admin/users/:id/role` route once there's a first admin to call it.
- Decide whether `instructor`/`admin` should also gate anything beyond Problems
  (e.g. future analytics or user-management endpoints).
- Add integration tests for the 403 case on the Problems write routes, and for the
  "any authenticated user can read" case on the Problems read routes.
- Add role changes to an audit log before this is used for anything sensitive.

## Authorization Rules

- Authentication answers "who is this user?" — handled by `protect`.
- Authorization answers "what may this user do?" — handled by `requireRole` where present.
- User-controlled request fields must never decide role or ownership. (Confirmed: `role`
  is never read from `req.body` anywhere in the codebase — only from `req.user`, which
  comes from the verified JWT + DB lookup.)
- Ownership checks (e.g. trainer-board circuits, saved via `userId`) compare
  `req.user._id` against the stored document's `userId` — see
  `SavedCircuit.findOwnedById` — rather than trusting any client-supplied owner field.

## Audit and Compliance Notes

Still open, not yet implemented:

- Add role changes to an audit log.
- Require strong passwords or SSO for elevated roles.
- Use least privilege for database users.
- Add integration tests for every protected route and forbidden role case.
