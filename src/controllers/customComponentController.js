const { createHttpError } = require("../utils/httpError");
const CustomComponent = require("../models/CustomComponent");

const MAX_PORTS = 16;

function readComponentPayload(body = {}) {
  const { name = "Untitled Component", inputs = [], outputs = [], gates = [], wires = [] } = body;

  if (!Array.isArray(inputs) || !Array.isArray(outputs) || !Array.isArray(gates) || !Array.isArray(wires)) {
    throw createHttpError(400, "inputs, outputs, gates, and wires must be arrays.");
  }
  if (inputs.length === 0 || outputs.length === 0) {
    throw createHttpError(400, "A custom component needs at least one input and one output.");
  }
  if (inputs.length > MAX_PORTS || outputs.length > MAX_PORTS) {
    throw createHttpError(400, `A custom component can have at most ${MAX_PORTS} inputs/outputs.`);
  }

  return {
    name: String(name).trim().slice(0, 40) || "Untitled Component",
    inputs: inputs.map((p, i) => ({ label: String(p?.label ?? `I${i}`).trim().slice(0, 20) || `I${i}` })),
    outputs: outputs.map((p, i) => ({ label: String(p?.label ?? `O${i}`).trim().slice(0, 20) || `O${i}` })),
    gates,
    wires,
  };
}

function sanitizeComponent(doc) {
  return {
    id: doc._id,
    name: doc.name,
    inputs: doc.inputs,
    outputs: doc.outputs,
    gates: doc.gates,
    wires: doc.wires,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function createComponent(req, res, next) {
  try {
    const payload = readComponentPayload(req.body);
    const doc = await CustomComponent.create({ userId: req.user._id, ...payload });
    res.status(201).json({ success: true, message: "Component saved.", component: sanitizeComponent(doc) });
  } catch (error) {
    next(error);
  }
}

async function listComponents(req, res, next) {
  try {
    const docs = await CustomComponent.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    res.status(200).json({ success: true, components: docs.map(sanitizeComponent) });
  } catch (error) {
    next(error);
  }
}

async function deleteComponent(req, res, next) {
  try {
    const doc = await CustomComponent.findOwnedById(req.params.id, req.user._id);
    if (!doc) throw createHttpError(404, "Custom component not found.");
    await doc.deleteOne();
    res.status(200).json({ success: true, message: "Component deleted." });
  } catch (error) {
    next(error);
  }
}

module.exports = { createComponent, listComponents, deleteComponent };