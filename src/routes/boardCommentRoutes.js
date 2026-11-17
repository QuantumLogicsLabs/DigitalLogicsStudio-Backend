const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  listBoardComments,
  createBoardComment,
  updateBoardComment,
  deleteBoardComment,
} = require("../controllers/boardCommentController");

const router = express.Router();

router.use(protect);
router.get("/", listBoardComments);
router.post("/", createBoardComment);
router.patch("/:id", updateBoardComment);
router.delete("/:id", deleteBoardComment);

module.exports = router;
