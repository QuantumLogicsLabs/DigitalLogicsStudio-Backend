const express = require("express");
const { protect, requireRole } = require("../middleware/authMiddleware");
const {
  listProblems,
  getProblem,
  createProblem,
  updateProblem,
  deleteProblem,
} = require("../controllers/problemController");

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Problems
 *   description: CRUD endpoints for the problem catalog (DLD circuit problems and COAL conceptual problems)
 */

/**
 * @swagger
 * /api/problems:
 *   get:
 *     summary: List all problems
 *     tags: [Problems]
 *     description: Returns every problem in the catalog, sorted by numeric id ascending. Requires authentication.
 *     responses:
 *       200:
 *         description: List of problems
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 problems:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Problem'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", listProblems);

/**
 * @swagger
 * /api/problems/{id}:
 *   get:
 *     summary: Get a single problem by numeric id
 *     tags: [Problems]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric problem id
 *         example: 5
 *     responses:
 *       200:
 *         description: The requested problem
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 problem:
 *                   $ref: '#/components/schemas/Problem'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Problem not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:id", getProblem);

/**
 * @swagger
 * /api/problems:
 *   post:
 *     summary: Create a new problem
 *     tags: [Problems]
 *     description: >
 *       Requires the `instructor` or `admin` role. `id` must be a numeric id that does not
 *       already exist (see docs/PROBLEM_ID_RANGES.md for allocation ranges). `truthTable` may
 *       be left as an empty array for non-circuit (e.g. COAL conceptual) problems, but if rows
 *       are supplied there must be exactly 2^inputs.length of them, and every row's keys must
 *       match the declared `inputs`/`outputs` exactly.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProblemInput'
 *     responses:
 *       201:
 *         description: Problem created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Problem created.
 *                 problem:
 *                   $ref: '#/components/schemas/Problem'
 *       400:
 *         description: Validation error (missing/invalid fields, bad truth table shape, missing id)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Authenticated but not an instructor or admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: A problem with this id already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/", requireRole("instructor", "admin"), createProblem);

/**
 * @swagger
 * /api/problems/{id}:
 *   put:
 *     summary: Update an existing problem
 *     tags: [Problems]
 *     description: >
 *       Requires the `instructor` or `admin` role. The `id` in the path is authoritative;
 *       any `id` sent in the body is ignored and overwritten with the existing document's id.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric id of the problem to update
 *         example: 5
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProblemInput'
 *     responses:
 *       200:
 *         description: Problem updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Problem updated.
 *                 problem:
 *                   $ref: '#/components/schemas/Problem'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Authenticated but not an instructor or admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Problem not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/:id", requireRole("instructor", "admin"), updateProblem);

/**
 * @swagger
 * /api/problems/{id}:
 *   delete:
 *     summary: Delete a problem
 *     tags: [Problems]
 *     description: Requires the `instructor` or `admin` role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric id of the problem to delete
 *         example: 5
 *     responses:
 *       200:
 *         description: Problem deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Authenticated but not an instructor or admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Problem not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/:id", requireRole("instructor", "admin"), deleteProblem);

module.exports = router;
