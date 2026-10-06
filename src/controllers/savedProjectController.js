const { createHttpError } = require("../utils/httpError");
const SavedProject = require("../models/SavedProject");

const MAX_VERSIONS = 10;

function sanitizeSummary(doc) {
  return {
    id: doc._id,
    name: doc.name,
    versionCount: doc.versions.length,
    updatedAt: doc.updatedAt,
    lastSavedAt: doc.versions[0]?.time || null,
  };
}

function sanitizeFull(doc) {
  return {
    id: doc._id,
    name: doc.name,
    versions: doc.versions,
    updatedAt: doc.updatedAt,
  };
}

/**
 * POST /api/boolforge-projects
 * Upsert by (userId, name): existing project gets a new version prepended
 * (capped at MAX_VERSIONS); a new name creates a fresh project.
 */
async function saveProject(req, res, next) {
  try {
    const { name, sheets } = req.body || {};
    const trimmedName = String(name || "").trim().slice(0, 80);
    if (!trimmedName) throw createHttpError(400, "A project name is required.");
    if (!Array.isArray(sheets) || sheets.length === 0) {
      throw createHttpError(400, "sheets must be a non-empty array.");
    }

    const newVersion = { sheets, time: Date.now() };

    let doc = await SavedProject.findOwnedByName(trimmedName, req.user._id);
    if (doc) {
      doc.versions = [newVersion, ...doc.versions].slice(0, MAX_VERSIONS);
      await doc.save();
    } else {
      doc = await SavedProject.create({
        userId: req.user._id,
        name: trimmedName,
        versions: [newVersion],
      });
    }

    res.status(200).json({ success: true, message: "Project saved.", project: sanitizeFull(doc) });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/boolforge-projects
 * Summaries only — no sheets payload, keeps the list light (same
 * reasoning as trainer-board's listCircuits).
 */
async function listProjects(req, res, next) {
  try {
    const docs = await SavedProject.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    res.status(200).json({ success: true, projects: docs.map(sanitizeSummary) });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/boolforge-projects/:id
 * Full project including all versions (frontend loads versions[0], the
 * most recent, but the full history is available for a future "restore
 * an older version" feature without another schema change).
 */
async function getProject(req, res, next) {
  try {
    const doc = await SavedProject.findOwnedById(req.params.id, req.user._id);
    if (!doc) throw createHttpError(404, "Project not found.");
    res.status(200).json({ success: true, project: sanitizeFull(doc) });
  } catch (error) {
    next(error);
  }
}

async function deleteProject(req, res, next) {
  try {
    const doc = await SavedProject.findOwnedById(req.params.id, req.user._id);
    if (!doc) throw createHttpError(404, "Project not found.");
    await doc.deleteOne();
    res.status(200).json({ success: true, message: "Project deleted." });
  } catch (error) {
    next(error);
  }
}

module.exports = { saveProject, listProjects, getProject, deleteProject };