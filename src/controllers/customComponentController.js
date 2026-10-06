const { createHttpError } = require("../utils/httpError");
const CustomComponent = require("../models/CustomComponent");

const MAX_PORTS = 16;

function readComponentPayload(body = {}, isUpdate = false) {
  const { 
    name, 
    description, 
    inputs, 
    outputs, 
    gates, 
    wires 
  } = body;

  const payload = {};

  // Handle Name
  if (name !== undefined) {
    payload.name = String(name).trim().slice(0, 40) || "Untitled Component";
  } else if (!isUpdate) {
    payload.name = "Untitled Component";
  }

  // Handle Description
  if (description !== undefined) {
    payload.description = String(description).trim().slice(0, 200);
  } else if (!isUpdate) {
    payload.description = "";
  }

  // Handle Inputs
  if (inputs !== undefined) {
    if (!Array.isArray(inputs)) {
      throw createHttpError(400, "inputs must be an array.");
    }
    if (inputs.length > MAX_PORTS) {
      throw createHttpError(400, `A custom component can have at most ${MAX_PORTS} inputs.`);
    }
    payload.inputs = inputs.map((p, i) => ({
      label: String(p?.label ?? `I${i}`).trim().slice(0, 20) || `I${i}`,
    }));
  } else if (!isUpdate) {
    payload.inputs = [];
  }

  // Handle Outputs
  if (outputs !== undefined) {
    if (!Array.isArray(outputs)) {
      throw createHttpError(400, "outputs must be an array.");
    }
    if (outputs.length > MAX_PORTS) {
      throw createHttpError(400, `A custom component can have at most ${MAX_PORTS} outputs.`);
    }
    payload.outputs = outputs.map((p, i) => ({
      label: String(p?.label ?? `O${i}`).trim().slice(0, 20) || `O${i}`,
    }));
  } else if (!isUpdate) {
    payload.outputs = [];
  }

  // Handle Internal Gates
  if (gates !== undefined) {
    if (!Array.isArray(gates)) {
      throw createHttpError(400, "gates must be an array.");
    }
    payload.gates = gates;
  } else if (!isUpdate) {
    payload.gates = [];
  }

  // Handle Internal Wires
  if (wires !== undefined) {
    if (!Array.isArray(wires)) {
      throw createHttpError(400, "wires must be an array.");
    }
    payload.wires = wires;
  } else if (!isUpdate) {
    payload.wires = [];
  }

  // Minimum port check for new component creations
  if (!isUpdate && (payload.inputs.length === 0 || payload.outputs.length === 0)) {
    throw createHttpError(400, "A custom component needs at least one input and one output.");
  }

  return payload;
}

function sanitizeComponent(doc) {
  return {
    id: doc._id,
    name: doc.name,
    description: doc.description || "",
    inputs: doc.inputs || [],
    outputs: doc.outputs || [],
    gates: doc.gates || [],
    wires: doc.wires || [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function createComponent(req, res, next) {
  try {
    const payload = readComponentPayload(req.body, false);
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

async function getComponentById(req, res, next) {
  try {
    const doc = await CustomComponent.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) {
      throw createHttpError(404, "Custom component not found.");
    }
    res.status(200).json({ success: true, component: sanitizeComponent(doc) });
  } catch (error) {
    next(error);
  }
}

async function updateComponent(req, res, next) {
  try {
    const payload = readComponentPayload(req.body, true);
    const doc = await CustomComponent.updateOwnedById(req.params.id, req.user._id, payload);

    if (!doc) {
      throw createHttpError(404, "Custom component not found.");
    }

    res.status(200).json({
      success: true,
      message: "Component updated.",
      component: sanitizeComponent(doc),
    });
  } catch (error) {
    next(error);
  }
}

async function deleteComponent(req, res, next) {
  try {
    const doc = await CustomComponent.deleteOwnedById(req.params.id, req.user._id);

    if (!doc) {
      throw createHttpError(404, "Custom component not found.");
    }

    res.status(200).json({ success: true, message: "Component deleted." });
  } catch (error) {
    next(error);
  }
}

module.exports = { 
  createComponent, 
  listComponents, 
  getComponentById, 
  updateComponent, 
  deleteComponent 
};