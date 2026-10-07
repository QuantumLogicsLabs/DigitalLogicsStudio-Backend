// XP earned from practice problems, bucketed per day.
//
// The rule is the one the Problems page already shows a learner
// (frontend ProblemsPage.jsx: `solvedCount * 100 + attemptedCount * 30`):
//
//   30 XP  the first time a problem is attempted
//   100 XP the first time a problem is solved
//
// Each is earned once per problem. Un-marking a problem and solving it again
// re-stamps `solvedAt` but not `firstSolvedAt`, so XP cannot be re-earned by
// toggling. That matters because this is the number the Quantum Community
// portal converts into points (controllers/communityController.js) — a total
// that could be pumped by clicking a checkbox would not be worth ranking on.
//
// Nothing here is stored: a day's XP is derived from the timestamps on
// UserProgress.problemProgress, so it cannot drift from the progress it
// describes.

const XP_PER_ATTEMPTED_PROBLEM = 30;
const XP_PER_SOLVED_PROBLEM = 100;

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MINUTE_MS = 60 * 1000;

/**
 * When a problem was first attempted, or null if it never was. Entries saved
 * before `firstAttemptAt` existed fall back to when the problem was first
 * opened, which is when their first attempt was recorded.
 */
function firstAttemptAtOf(entry) {
  if (entry.firstAttemptAt) return entry.firstAttemptAt;
  if (entry.attempts > 0) return entry.openedAt || entry.lastAttemptAt || null;
  return null;
}

/**
 * When a problem was first solved, or null. Entries saved before
 * `firstSolvedAt` existed fall back to `solvedAt`.
 */
function firstSolvedAtOf(entry) {
  return entry.firstSolvedAt || entry.solvedAt || null;
}

/**
 * Calendar day ("YYYY-MM-DD") an instant falls on, in the timezone
 * `offsetMinutes` east of UTC. Returns null for an unparseable instant.
 */
function dayKeyOf(instant, offsetMinutes = 0) {
  const time = new Date(instant).getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time + offsetMinutes * MINUTE_MS).toISOString().slice(0, 10);
}

/**
 * XP per day from a user's problem progress, oldest day first.
 *
 * @param {Array} problemProgress UserProgress.problemProgress
 * @param {{ offsetMinutes?: number, since?: string|null }} options
 *   `offsetMinutes` picks the calendar the days are cut on; `since` is an
 *   inclusive "YYYY-MM-DD" lower bound in that same calendar.
 * @returns {Array<{ date: string, xp: number, attempted: number, solved: number }>}
 */
function buildDailyXp(problemProgress = [], { offsetMinutes = 0, since = null } = {}) {
  const byDay = new Map();

  const credit = (instant, field, xp) => {
    if (!instant) return;
    const date = dayKeyOf(instant, offsetMinutes);
    if (!date || (since && date < since)) return;
    const day = byDay.get(date) || { date, xp: 0, attempted: 0, solved: 0 };
    day.xp += xp;
    day[field] += 1;
    byDay.set(date, day);
  };

  for (const entry of problemProgress || []) {
    credit(firstAttemptAtOf(entry), "attempted", XP_PER_ATTEMPTED_PROBLEM);
    credit(firstSolvedAtOf(entry), "solved", XP_PER_SOLVED_PROBLEM);
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = {
  XP_PER_ATTEMPTED_PROBLEM,
  XP_PER_SOLVED_PROBLEM,
  DAY_KEY_PATTERN,
  firstAttemptAtOf,
  firstSolvedAtOf,
  dayKeyOf,
  buildDailyXp,
};
