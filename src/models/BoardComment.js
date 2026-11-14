const mongoose = require("mongoose");

const BoardCommentSchema = new mongoose.Schema(
  {
    boardKey: { type: String, required: true, trim: true, maxlength: 200, index: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

BoardCommentSchema.index({ boardKey: 1, createdAt: 1 });

module.exports = mongoose.model("BoardComment", BoardCommentSchema);
