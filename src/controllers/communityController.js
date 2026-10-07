const User = require("../models/User");
const UserProgress = require("../models/UserProgress");
const { createHttpError } = require("../utils/httpError");
const {
  XP_PER_ATTEMPTED_PROBLEM,
  XP_PER_SOLVED_PROBLEM,
  DAY_KEY_PATTERN,
  buildDailyXp,
} = require("../services/xpService");

// Keeps a request inside the app-wide 10kb JSON body limit (src/app.js).
const MAX_EMAILS_PER_REQUEST = 100;
// UTC-12:00 to UTC+14:00, the range real timezones span.
const MIN_TZ_OFFSET_MINUTES = -12 * 60;
const MAX_TZ_OFFSET_MINUTES = 14 * 60;

// Only the timestamps xpService reads — never titles, tags or topic progress.
const PROBLEM_XP_FIELDS = [
  "attempts",
  "openedAt",
  "lastAttemptAt",
  "solvedAt",
  "firstAttemptAt",
  "firstSolvedAt",
]
  .map((field) => `problemProgress.${field}`)
  .join(" ");

function readEmails(body = {}) {
  const { emails } = body;
  if (!Array.isArray(emails) || emails.length === 0) {
    throw createHttpError(400, "emails must be a non-empty array.");
  }
  if (emails.length > MAX_EMAILS_PER_REQUEST) {
    throw createHttpError(
      400,
      `At most ${MAX_EMAILS_PER_REQUEST} emails per request.`,
    );
  }

  const normalized = new Set();
  for (const email of emails) {
    if (typeof email !== "string") {
      throw createHttpError(400, "emails must be strings.");
    }
    const value = email.trim().toLowerCase();
    if (value) normalized.add(value);
  }
  return [...normalized];
}

function readSince(body = {}) {
  const { since } = body;
  if (since === undefined || since === null || since === "") return null;
  if (typeof since !== "string" || !DAY_KEY_PATTERN.test(since)) {
    throw createHttpError(400, "since must be a YYYY-MM-DD date.");
  }
  return since;
}

function readTzOffsetMinutes(body = {}) {
  const { tzOffsetMinutes } = body;
  if (tzOffsetMinutes === undefined || tzOffsetMinutes === null) return 0;
  if (
    !Number.isInteger(tzOffsetMinutes) ||
    tzOffsetMinutes < MIN_TZ_OFFSET_MINUTES ||
    tzOffsetMinutes > MAX_TZ_OFFSET_MINUTES
  ) {
    throw createHttpError(400, "tzOffsetMinutes must be a whole number of minutes.");
  }
  return tzOffsetMinutes;
}

/**
 * POST /api/community/xp
 * Per-day XP for the accounts registered under the given emails.
 *
 * Emails with no account here are left out of the response rather than
 * reported, and accounts are matched on exactly the emails asked for, so the
 * caller learns nothing about anyone it did not already know.
 */
async function getXpLedger(req, res, next) {
  try {
    const emails = readEmails(req.body);
    const since = readSince(req.body);
    const tzOffsetMinutes = readTzOffsetMinutes(req.body);

    const users = await User.find({ email: { $in: emails } })
      .select("_id email")
      .lean();

    const progressDocs = users.length
      ? await UserProgress.find({ userId: { $in: users.map((user) => user._id) } })
          .select(`userId ${PROBLEM_XP_FIELDS}`)
          .lean()
      : [];

    const problemsByUserId = new Map(
      progressDocs.map((doc) => [String(doc.userId), doc.problemProgress || []]),
    );

    const accounts = users.map((user) => {
      const problems = problemsByUserId.get(String(user._id)) || [];
      const allDays = buildDailyXp(problems, { offsetMinutes: tzOffsetMinutes });

      return {
        email: user.email,
        // Lifetime, whatever `since` asked for.
        totalXp: allDays.reduce((sum, day) => sum + day.xp, 0),
        days: since ? allDays.filter((day) => day.date >= since) : allDays,
      };
    });

    res.status(200).json({
      success: true,
      generatedAt: new Date().toISOString(),
      tzOffsetMinutes,
      xpRules: {
        attempted: XP_PER_ATTEMPTED_PROBLEM,
        solved: XP_PER_SOLVED_PROBLEM,
      },
      accounts,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getXpLedger, MAX_EMAILS_PER_REQUEST };
