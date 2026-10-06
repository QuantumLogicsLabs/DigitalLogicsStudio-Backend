const { createHttpError } = require("../utils/httpError");
const Problem = require("../models/Problem");

function sanitizeProblem(doc) {
  return {
    id: doc.id,
    listId: doc.listId,
    course: doc.course,
    title: doc.title,
    difficulty: doc.difficulty,
    tags: doc.tags,
    topic: doc.topic,
    description: doc.description,
    truthTable: doc.truthTable,
    equations: doc.equations,
    hint: doc.hint,
    inputs: doc.inputs,
    outputs: doc.outputs,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function readProblemPayload(body = {}) {
  const {
    id,
    listId,
    course,
    title,
    difficulty,
    tags = [],
    topic = "",
    description,
    truthTable = [],
    equations = [],
    hint = "",
    inputs = [],
    outputs = [],
  } = body;

  if (!title || !String(title).trim()) {
    throw createHttpError(400, "Title is required.");
  }
  if (!["Easy", "Medium", "Hard"].includes(difficulty)) {
    throw createHttpError(400, "Difficulty must be Easy, Medium, or Hard.");
  }
  if (!["dld", "coal"].includes(course)) {
    throw createHttpError(400, "Course must be 'dld' or 'coal'.");
  }
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw createHttpError(400, "At least one input port is required.");
  }
  if (!Array.isArray(outputs) || outputs.length === 0) {
    throw createHttpError(400, "At least one output port is required.");
  }
  if (!Array.isArray(truthTable)) {
    throw createHttpError(400, "truthTable must be an array (use [] for non-circuit problems).");
  }
  // Circuit-style problems (DLD) must have a complete truth table. MCQ /
  // conceptual problems (COAL) intentionally ship with an empty truth table
  // — only enforce the 2^n row-count rule when rows were actually supplied,
  // so a nonempty-but-short truth table still gets caught.
  if (truthTable.length > 0 && truthTable.length !== 2 ** inputs.length) {
    throw createHttpError(
      400,
      `Truth table must have exactly ${2 ** inputs.length} rows for ${inputs.length} input(s), or be left empty for non-circuit problems.`,
    );
  }
  const expectedKeys = [...inputs, ...outputs].sort().join(",");
  const badRow = truthTable.find(
    (row) => Object.keys(row || {}).sort().join(",") !== expectedKeys,
  );
  if (truthTable.length > 0 && badRow) {
    throw createHttpError(400, "Every truth table row must match the declared inputs/outputs exactly.");
  }

  return {
    id,
    listId,
    course,
    title: String(title).trim().slice(0, 120),
    difficulty,
    tags: Array.isArray(tags) ? tags : [],
    topic: String(topic || ""),
    description: String(description || ""),
    truthTable,
    equations: Array.isArray(equations) ? equations : [],
    hint: String(hint || ""),
    inputs,
    outputs,
  };
}

async function listProblems(req, res, next) {
  try {
    const docs = await Problem.find().sort({ id: 1 });
    res.status(200).json({ success: true, problems: docs.map(sanitizeProblem) });
  } catch (error) {
    next(error);
  }
}

async function getProblem(req, res, next) {
  try {
    const doc = await Problem.findOne({ id: Number(req.params.id) });
    if (!doc) throw createHttpError(404, "Problem not found.");
    res.status(200).json({ success: true, problem: sanitizeProblem(doc) });
  } catch (error) {
    next(error);
  }
}

async function createProblem(req, res, next) {
  try {
    const payload = readProblemPayload(req.body);

    if (!payload.id) {
      throw createHttpError(
        400,
        "A numeric id is required (pick one outside existing ranges — see docs/PROBLEM_ID_RANGES.md).",
      );
    }

    const existing = await Problem.findOne({ id: payload.id });
    if (existing) {
      throw createHttpError(409, `Problem id ${payload.id} already exists.`);
    }

    const doc = await Problem.create({
      ...payload,
      listId:
        payload.listId ||
        `${payload.course.toUpperCase()}-${String(payload.id).padStart(4, "0")}`,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    res.status(201).json({ success: true, message: "Problem created.", problem: sanitizeProblem(doc) });
  } catch (error) {
    next(error);
  }
}

async function updateProblem(req, res, next) {
  try {
    const doc = await Problem.findOne({ id: Number(req.params.id) });
    if (!doc) throw createHttpError(404, "Problem not found.");

    const payload = readProblemPayload({ ...req.body, id: doc.id });
    Object.assign(doc, payload, { id: doc.id, updatedBy: req.user._id });
    await doc.save();

    res.status(200).json({ success: true, message: "Problem updated.", problem: sanitizeProblem(doc) });
  } catch (error) {
    next(error);
  }
}

async function deleteProblem(req, res, next) {
  try {
    const doc = await Problem.findOne({ id: Number(req.params.id) });
    if (!doc) throw createHttpError(404, "Problem not found.");

    await doc.deleteOne();

    res.status(200).json({ success: true, message: "Problem deleted." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listProblems,
  getProblem,
  createProblem,
  updateProblem,
  deleteProblem,
};

