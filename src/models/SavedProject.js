const mongoose = require("mongoose");

const SavedProjectVersionSchema = new mongoose.Schema(
  {
    sheets: { type: Array, required: true },
    time: { type: Number, required: true },
  },
  { _id: false },
);

const SavedProjectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    versions: { type: [SavedProjectVersionSchema], required: true, default: [] },
  },
  { timestamps: true },
);

// One project per (user, name) — saving again under the same name
// pushes a new version instead of creating a duplicate document.
SavedProjectSchema.index({ userId: 1, name: 1 }, { unique: true });

SavedProjectSchema.statics.findOwnedById = function (id, userId) {
  return this.findOne({ _id: id, userId });
};

SavedProjectSchema.statics.findOwnedByName = function (name, userId) {
  return this.findOne({ name, userId });
};

module.exports = mongoose.model("SavedProject", SavedProjectSchema);