const express = require("express");
const { internalAuth } = require("../middleware/internalAuth");
const { processPendingEmails } = require("../services/emailQueueService");
const { runInactivityCheck, runWeeklyDigest } = require("../services/notificationService");

const router = express.Router();

router.use(internalAuth);

/**
 * @swagger
 * tags:
 *   name: Internal
 *   description: >
 *     Ops-only endpoints, not part of the public frontend-facing API surface. Every route
 *     in this file requires a Bearer token matching the CRON_SECRET environment variable.
 *     Vercel Cron sends this automatically on scheduled invocations when an env var literally
 *     named CRON_SECRET is set on the project — no extra Vercel config is needed beyond that.
 */

/**
 * @swagger
 * /api/internal/run-daily-jobs:
 *   get:
 *     summary: Run all scheduled daily jobs (queue retry, inactivity check, weekly digest)
 *     tags: [Internal]
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Single entrypoint for everything the Vercel Cron job triggers once a day (Hobby-tier
 *       limit of one cron run/day). Runs `processPendingEmails`, `runInactivityCheck`, and
 *       `runWeeklyDigest` in sequence. All three are idempotent per-user (each checks its own
 *       "last sent" timestamp internally), so calling this endpoint more or less often than
 *       exactly once a day is harmless. Registered as GET (what Vercel Cron sends) and POST
 *       (for manual triggering during testing, e.g. via curl or Postman).
 *     responses:
 *       200:
 *         description: Jobs ran successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 queue:
 *                   type: object
 *                   description: Result of processPendingEmails
 *                   properties:
 *                     processed: { type: integer, example: 3 }
 *                     sent: { type: integer, example: 2 }
 *                     failed: { type: integer, example: 0 }
 *                     stillPending: { type: integer, example: 1 }
 *                 inactivity:
 *                   type: object
 *                   description: Result of runInactivityCheck
 *                   properties:
 *                     checked: { type: integer, example: 40 }
 *                     sent: { type: integer, example: 5 }
 *                 digest:
 *                   type: object
 *                   description: Result of runWeeklyDigest
 *                   properties:
 *                     checked: { type: integer, example: 40 }
 *                     sent: { type: integer, example: 12 }
 *       401:
 *         description: Missing/incorrect bearer token, or CRON_SECRET not configured on the server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     summary: Run all scheduled daily jobs (manual trigger)
 *     tags: [Internal]
 *     security:
 *       - bearerAuth: []
 *     description: Identical behavior to the GET route above; exists so the job can be triggered manually during testing.
 *     responses:
 *       200:
 *         description: Jobs ran successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 queue:
 *                   type: object
 *                   properties:
 *                     processed: { type: integer, example: 3 }
 *                     sent: { type: integer, example: 2 }
 *                     failed: { type: integer, example: 0 }
 *                     stillPending: { type: integer, example: 1 }
 *                 inactivity:
 *                   type: object
 *                   properties:
 *                     checked: { type: integer, example: 40 }
 *                     sent: { type: integer, example: 5 }
 *                 digest:
 *                   type: object
 *                   properties:
 *                     checked: { type: integer, example: 40 }
 *                     sent: { type: integer, example: 12 }
 *       401:
 *         description: Missing/incorrect bearer token, or CRON_SECRET not configured on the server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
async function runDailyJobs(req, res, next) {
  try {
    const queue = await processPendingEmails(50);
    const inactivity = await runInactivityCheck();
    const digest = await runWeeklyDigest();
    res.status(200).json({ success: true, queue, inactivity, digest });
  } catch (error) {
    next(error);
  }
}

router.get("/run-daily-jobs", runDailyJobs);
router.post("/run-daily-jobs", runDailyJobs);

// Lighter-weight endpoint if you ever want to retry the queue on its own
// (e.g. from a more frequent cron on a paid Vercel plan).
/**
 * @swagger
 * /api/internal/process-email-queue:
 *   post:
 *     summary: Retry pending/due emails in the queue only
 *     tags: [Internal]
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Narrower than /run-daily-jobs — only processes the EmailQueue (skips the inactivity
 *       check and weekly digest). Useful for retrying the queue on its own, e.g. from a more
 *       frequent cron on a paid Vercel plan.
 *     responses:
 *       200:
 *         description: Queue processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 result:
 *                   type: object
 *                   properties:
 *                     processed: { type: integer, example: 5 }
 *                     sent: { type: integer, example: 4 }
 *                     failed: { type: integer, example: 0 }
 *                     stillPending: { type: integer, example: 1 }
 *       401:
 *         description: Missing/incorrect bearer token, or CRON_SECRET not configured on the server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/process-email-queue", async (req, res, next) => {
  try {
    const result = await processPendingEmails(50);
    res.status(200).json({ success: true, result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
