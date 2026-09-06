const mongoose = require("mongoose");

const PortSchema = new mongoose.Schema(
  { label: { type: String, required: true, trim: true, maxlength: 20 } },
  { _id: false },
);

const CustomComponentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    inputs: { type: [PortSchema], required: true, validate: (v) => v.length >= 1 && v.length <= 16 },
    outputs: { type: [PortSchema], required: true, validate: (v) => v.length >= 1 && v.length <= 16 },
    gates: { type: Array, required: true },
    wires: { type: Array, required: true },
  },
  { timestamps: true },
);

CustomComponentSchema.statics.findOwnedById = function (id, userId) {
  return this.findOne({ _id: id, userId });
};

module.exports = mongoose.model("CustomComponent", CustomComponentSchema);