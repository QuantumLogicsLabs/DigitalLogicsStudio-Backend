const crypto = require("crypto");
const { createHttpError } = require("../utils/httpError");

/**
 * Guards /api/community/* — the server-to-server endpoints the Quantum
 * Community portal's contribution-worker calls. Checks for a bearer token
 * matching COMMUNITY_SYNC_SECRET.
 *
 * Deliberately its own secret rather than CRON_SECRET: that one can trigger
 * the email jobs under /api/internal, and the worker only ever needs to read
 * XP. With the env var unset the endpoints are simply off.
 */
function communityAuth(req, res, next) {
  const expected = process.env.COMMUNITY_SYNC_SECRET;

  if (!expected) {
    return next(createHttpError(503, "Community sync is not configured on the server."));
  }

  const authHeader = req.headers.authorization || "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  // Compared as digests so the check takes the same time whatever was sent.
  const digest = (value) => crypto.createHash("sha256").update(value).digest();
  if (!provided || !crypto.timingSafeEqual(digest(provided), digest(expected))) {
    return next(createHttpError(401, "Unauthorized."));
  }

  next();
}

module.exports = { communityAuth };
