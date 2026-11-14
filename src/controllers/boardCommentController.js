const { createHttpError } = require("../utils/httpError");
const BoardComment = require("../models/BoardComment");

function readBoardKey(value) {
  const boardKey = String(value || "").trim();
  if (!boardKey || boardKey.length > 200) {
    throw createHttpError(400, "A valid board key is required.");
  }
  return boardKey;
}

function readCommentText(value) {
  const text = String(value || "").trim();
  if (!text) throw createHttpError(400, "Comment text cannot be empty.");
  if (text.length > 2000) throw createHttpError(400, "Comment text is too long.");
  return text;
}

function sanitizeComment(doc, userId) {
  const author = doc.authorId || {};
  return {
    id: doc._id,
    boardKey: doc.boardKey,
    text: doc.text,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    author: {
      id: author._id,
      name: author.name || "Student",
      avatarUrl: author.avatarUrl || null,
    },
    isOwner: String(author._id) === String(userId),
  };
}

async function listBoardComments(req, res, next) {
  try {
    const boardKey = readBoardKey(req.query.boardKey);
    const comments = await BoardComment.find({ boardKey })
      .populate("authorId", "name avatarUrl")
      .sort({ createdAt: 1 });

    res.json({ success: true, comments: comments.map((comment) => sanitizeComment(comment, req.user._id)) });
  } catch (error) {
    next(error);
  }
}

async function createBoardComment(req, res, next) {
  try {
    const boardKey = readBoardKey(req.body?.boardKey);
    const text = readCommentText(req.body?.text);
    const comment = await BoardComment.create({ boardKey, text, authorId: req.user._id });
    await comment.populate("authorId", "name avatarUrl");

    res.status(201).json({ success: true, comment: sanitizeComment(comment, req.user._id) });
  } catch (error) {
    next(error);
  }
}

async function updateBoardComment(req, res, next) {
  try {
    const text = readCommentText(req.body?.text);
    const comment = await BoardComment.findOne({ _id: req.params.id, authorId: req.user._id });
    if (!comment) throw createHttpError(404, "Comment not found or not owned by you.");

    comment.text = text;
    await comment.save();
    await comment.populate("authorId", "name avatarUrl");

    res.json({ success: true, comment: sanitizeComment(comment, req.user._id) });
  } catch (error) {
    next(error);
  }
}

async function deleteBoardComment(req, res, next) {
  try {
    const comment = await BoardComment.findOneAndDelete({ _id: req.params.id, authorId: req.user._id });
    if (!comment) throw createHttpError(404, "Comment not found or not owned by you.");
    res.json({ success: true, message: "Comment deleted." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listBoardComments,
  createBoardComment,
  updateBoardComment,
  deleteBoardComment,
};
