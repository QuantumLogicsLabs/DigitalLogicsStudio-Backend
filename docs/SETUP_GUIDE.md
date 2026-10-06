# Backend Setup Guide

This guide explains how to run the Digital Logics Studio backend locally with the same assumptions used in production.

## Prerequisites

- Node.js 18 or newer recommended.
- npm 9 or newer recommended.
- A MongoDB Atlas cluster or local MongoDB instance.
- A frontend origin, usually `http://localhost:3000` during development.

## Install

```bash
cd backend
npm install
```

The repository tracks `package-lock.json` so installs are reproducible.

## Environment Variables

Create a local `.env` file from `.env.example`.

```bash
cp .env.example .env
```

Required variables:

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `PORT` | No | `5000` | Local HTTP port. Defaults to `5000`. |
| `NODE_ENV` | Yes | `development` | Use `production` only in deployed runtime. |
| `CLIENT_URL` | Yes | `http://localhost:3000` | Browser origin allowed by CORS. No trailing slash. |
| `CLIENT_ORIGIN` | No | `https://preview.example.com` | Optional additional origin list. Comma-separated values are supported. |
| `FRONTEND_URL` | No | `https://circuits.quantumlogicslimited.com` | Optional additional origin list. |
| `MONGO_URI` | Yes | `mongodb+srv://...` | MongoDB connection string. Keep it secret. |
| `JWT_SECRET` | Yes | long random string | Must be high entropy and unique per environment. |
| `JWT_EXPIRES_IN` | No | `7d` | Passed to `jsonwebtoken.sign`. |
| `COOKIE_EXPIRES_DAYS` | No | `7` | Controls auth cookie lifetime. |

## Start Development Server

```bash
npm run dev
```

The local server validates `MONGO_URI` and `JWT_SECRET`, connects to MongoDB, then listens on `PORT`.

## Production-Like Local Run

```bash
NODE_ENV=development npm start
```

The `server.js` entrypoint only calls `app.listen` outside production. In `NODE_ENV=production`, it exports a Vercel-compatible request handler and lazy-connects to MongoDB on first non-OPTIONS request.

## Seeding Data (Optional — Not Required for Setup)

```bash
npm run seed:problems
```

This runs `scripts/seedProblems.js`, which idempotently upserts `scripts/seedData/problems.json`
into the `Problem` collection consumed by `/api/problems`.

**This step is optional and can be skipped for normal local development.** The frontend
does not currently call `/api/problems` — its problem catalog is sourced elsewhere — so
an empty `Problem` collection does not affect the app's day-to-day functionality. Run
this seed script only if you're testing or building directly against the
`/api/problems` CRUD API. This will change to a required setup step once the frontend is
switched over to consume this collection; this guide should be updated at that point.

## Health Checks

```bash
curl http://localhost:5000/
curl http://localhost:5000/api/health
```

Expected `GET /api/health` response:

```json
{
  "success": true,
  "message": "API is healthy",
  "environment": "development"
}
```

## Swagger

After startup, visit:

- `http://localhost:5000/api/docs`
- `http://localhost:5000/api/docs.json`

Swagger UI can test cookie-authenticated routes after calling `POST /api/auth/login` from the same API origin. The Problems tag (`/api/problems/*`) and the Internal tag
(`/api/internal/*`) are documented there too — Problems is backend-only for now (see
above), and Internal routes require a Bearer token equal to `CRON_SECRET` rather than
the login cookie.

## Common Setup Problems

| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| Startup fails with missing env vars | `.env` missing or incomplete | Copy `.env.example` and fill `MONGO_URI`, `JWT_SECRET`. |
| Browser blocks API call | CORS origin mismatch | Set `CLIENT_URL` to the exact frontend origin. |
| `/api/auth/me` returns 401 after login in production | Cookie cannot cross origins | Ensure HTTPS, `NODE_ENV=production`, and frontend uses `withCredentials: true`. |
| Mongo connection timeout | Bad network allowlist or URI | Check MongoDB Atlas IP access, username, password, and database name. |
| `/api/problems` returns an empty list | `Problem` collection hasn't been seeded | Expected — this is fine for normal local dev. Run `npm run seed:problems` only if you need this API populated. |
