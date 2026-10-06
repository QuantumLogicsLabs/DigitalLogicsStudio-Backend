const mongoose = require("mongoose");

const truthTableRowSchema = new mongoose.Schema(
  {},
  { strict: false, _id: false },
);

const problemSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
      unique: true,
    },
    listId: { type: String, required: true, unique: true },
    course: { type: String, enum: ["dld", "coal"], required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], required: true },
    tags: { type: [String], default: [] },
    topic: { type: String, default: "" },
    description: { type: String, required: true },
    truthTable: { type: [truthTableRowSchema], default: [] },
    equations: { type: [String], default: [] },
    hint: { type: String, default: "" },
    inputs: { type: [String], required: true, validate: (v) => v.length > 0 },
    outputs: { type: [String], required: true, validate: (v) => v.length > 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Problem", problemSchema);
