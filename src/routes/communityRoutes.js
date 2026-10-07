const express = require("express");
const { communityAuth } = require("../middleware/communityAuth");
const { getXpLedger } = require("../controllers/communityController");

const router = express.Router();

router.use(communityAuth);

/**
 * @swagger
 * tags:
 *   name: Community
 *   description: >
 *     Server-to-server endpoints for the Quantum Community portal, not part of the
 *     frontend-facing API surface. Every route in this file requires a Bearer token
 *     matching the COMMUNITY_SYNC_SECRET environment variable; with that variable unset
 *     the routes answer 503.
 */

/**
 * @swagger
 * /api/community/xp:
 *   post:
 *     summary: Per-day XP for a batch of accounts, looked up by email
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       What the Quantum Community contribution-worker polls to turn XP earned here into
 *       quantum points there. XP is 30 for the first attempt at a problem and 100 for the
 *       first time it is solved, each earned once per problem and dated on the day it
 *       happened (see services/xpService.js). Emails with no account are omitted from the
 *       response. POST rather than GET so email addresses never appear in a URL.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [emails]
 *             properties:
 *               emails:
 *                 type: array
 *                 maxItems: 100
 *                 items: { type: string, format: email }
 *               since:
 *                 type: string
 *                 description: Inclusive YYYY-MM-DD lower bound, in the calendar tzOffsetMinutes picks
 *                 example: "2026-01-01"
 *               tzOffsetMinutes:
 *                 type: integer
 *                 description: Minutes east of UTC that days are cut on (300 = Pakistan time). Defaults to 0.
 *                 example: 300
 *     responses:
 *       200:
 *         description: XP per day for every email that has an account
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 generatedAt: { type: string, format: date-time }
 *                 tzOffsetMinutes: { type: integer, example: 300 }
 *                 xpRules:
 *                   type: object
 *                   properties:
 *                     attempted: { type: integer, example: 30 }
 *                     solved: { type: integer, example: 100 }
 *                 accounts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       email: { type: string, format: email }
 *                       totalXp: { type: integer, example: 430 }
 *                       days:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             date: { type: string, example: "2026-10-07" }
 *                             xp: { type: integer, example: 130 }
 *                             attempted: { type: integer, example: 1 }
 *                             solved: { type: integer, example: 1 }
 *       400:
 *         description: Malformed emails, since or tzOffsetMinutes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or incorrect bearer token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: COMMUNITY_SYNC_SECRET is not configured on the server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/xp", getXpLedger);

module.exports = router;
