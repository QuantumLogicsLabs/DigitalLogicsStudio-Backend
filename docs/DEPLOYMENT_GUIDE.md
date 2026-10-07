# Backend Deployment Guide

The backend is designed to run on Vercel as a serverless Express handler while still supporting local `app.listen` development.

## Deployment Target

Production behavior is controlled by `server.js`:

- In non-production, it validates environment variables, connects to MongoDB, and starts an HTTP server.
- In production, it exports an async request handler for serverless platforms.
- OPTIONS preflight requests are answered before MongoDB connection to avoid CORS timeouts.
- MongoDB connection is established lazily on the first real request.

## Required Production Environment

Set these in the hosting provider dashboard:

```env
NODE_ENV=production
MONGO_URI=mongodb+srv://...
JWT_SECRET=<long-random-secret>
JWT_EXPIRES_IN=7d
COOKIE_EXPIRES_DAYS=7
CLIENT_URL=https://circuits.quantumlogicslimited.com
```

Optional variables:

```env
CLIENT_ORIGIN=https://preview-one.vercel.app,https://preview-two.vercel.app
FRONTEND_URL=https://alternate-frontend.example.com
# Turns on POST /api/community/xp for the Quantum Community portal's worker.
# Must equal DLS_SYNC_SECRET in that worker's .env.
COMMUNITY_SYNC_SECRET=<a-different-long-random-secret>
```

## CORS and Cookie Requirements

The frontend and backend may be on different domains. Production authentication therefore requires:

- HTTPS on both origins.
- `withCredentials: true` in the frontend Axios client.
- Backend CORS `credentials: true`.
- Auth cookie options `httpOnly: true`, `secure: true`, and `sameSite: "none"` in production.
- No explicit cookie `domain` unless the API and frontend intentionally share a parent domain strategy.

## Pre-Deployment Checklist

1. Verify `JWT_SECRET` is not reused from development.
2. Verify MongoDB user has least-privilege read/write permissions for the application database.
3. Verify `CLIENT_URL` exactly matches the deployed frontend origin.
4. Confirm `/api/health` returns 200 in the deployed environment.
5. Confirm `POST /api/auth/login` sets the `token` cookie.
6. Confirm `GET /api/auth/me` succeeds from the deployed frontend.
7. Confirm `/api/docs.json` is available only if public API docs are acceptable for the release.

## Release Smoke Test

```bash
curl https://<backend-domain>/
curl https://<backend-domain>/api/health
curl https://<backend-domain>/api/docs.json
```

Then test in browser:

1. Open the frontend production URL.
2. Create a test account.
3. Refresh the page and confirm session restore.
4. Solve or attempt a problem.
5. Open the profile page and confirm progress state hydrates.

## Rollback Strategy

- Keep the previous deployment available through the provider dashboard.
- Roll back environment variables and deployment artifact together when an auth or CORS change fails.
- Do not rotate `JWT_SECRET` during rollback unless intentionally invalidating all active sessions.

## Operational Notes

- The API currently uses embedded progress arrays inside the `User` document. Monitor document growth as activity volume increases.
- Add structured request logging before high-traffic launch.
- Add rate limiting before opening public registration broadly.
- Add automated integration tests for auth and progress before strict production SLAs.

