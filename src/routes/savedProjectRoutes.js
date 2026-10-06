const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { saveProject, listProjects, getProject, deleteProject } = require("../controllers/savedProjectController");

const router = express.Router();

router.use(protect);

router.get("/", listProjects);
router.get("/:id", getProject);
router.post("/", saveProject);
router.delete("/:id", deleteProject);

module.exports = router;
