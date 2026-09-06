# Backend Changelog

This project follows a human-readable changelog format. Version numbers should align with `package.json` releases when formal releases are cut.

## Unreleased

### Added

- `PATCH /api/auth/profile` — update display name and/or avatar (base64 data URL) for
  the logged-in user. New `User.avatarUrl` field. Mounted with a route-scoped 8MB JSON
  body limit (`src/app.js`) to accommodate base64-encoded photos without loosening the
  10kb default limit everywhere else.
- Mounted `PATCH /api/auth/change-password` and `POST /api/auth/delete-account` —
  both were already implemented in `authController.js` but had no route.
- Professional backend documentation set under `docs/`.
- API, architecture, setup, deployment, database, auth, RBAC, folder structure, contributing, security, and conduct documentation.

### Documented

- Current Express/Mongoose architecture.
- Cookie-based JWT authentication lifecycle.
- User-embedded progress model.
- Vercel serverless deployment behavior.
- Known token helper path inconsistency to resolve before production hardening.

## 1.0.0

### Added

- Express API application.
- MongoDB connection through Mongoose.
- User registration, login, logout, and current-session endpoints.
- bcrypt password hashing.
- JWT session cookie support.
- User progress endpoints for problems, topics, activity, and snapshots.
- Swagger UI and OpenAPI JSON endpoints.
- CORS allowlist and production cross-origin cookie support.
