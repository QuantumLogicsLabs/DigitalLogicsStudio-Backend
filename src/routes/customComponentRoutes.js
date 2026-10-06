const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createComponent,
  listComponents,
  deleteComponent,
} = require("../controllers/customComponentController");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: CustomComponents
 *   description: User-saved reusable custom components for Boolforge
 */

// Every custom-component endpoint requires a logged-in user, matching
// trainer-board's circuit routes.
router.use(protect);

/**
 * @swagger
 * /api/custom-components:
 *   get:
 *     summary: List the authenticated user's custom components
 *     tags: [CustomComponents]
 *     responses:
 *       200:
 *         description: List of custom components
 *       401:
 *         description: Not authenticated
 */
router.get("/", listComponents);

/**
 * @swagger
 * /api/custom-components:
 *   post:
 *     summary: Save a new custom component
 *     tags: [CustomComponents]
 *     responses:
 *       201:
 *         description: Component saved
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Not authenticated
 */
router.post("/", createComponent);

/**
 * @swagger
 * /api/custom-components/{id}:
 *   delete:
 *     summary: Delete a custom component
 *     tags: [CustomComponents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Component deleted
 *       404:
 *         description: Not found / not owned by this user
 *       401:
 *         description: Not authenticated
 */
router.delete("/:id", deleteComponent);

module.exports = router;