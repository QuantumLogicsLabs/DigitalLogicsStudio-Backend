// ─── Helpers ──────────────────────────────────────────────────────────────────

const { createHttpError } = require("../utils/httpError");
const { checkMilestones } = require("../services/notificationService");

const toDateKey = (date = new Date()) =>
  new Date(date).toISOString().slice(0, 10);

const makeEventId = (type) =>
  `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role || "student",
    solvedProblems: user.solvedProblems || [],
    createdAt: user.createdAt,
  };
}

function parsePositiveProblemId(problemId) {
  const parsedId = Number(problemId);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw createHttpError(400, "Problem id must be a positive integer.");
  }

  return parsedId;
}

function readProgressPayload(body = {}) {
  const { title = "", tags = [], topicId = null, totalSubtopics, subject } = body;
  // Accept "dld" or "coal"; default to "dld" for any unknown value
  const normalizedSubject = subject === "coal" ? "coal" : "dld";

  return {
    title,
    tags,
    topicId,
    totalSubtopics,
    subject: normalizedSubject,
  };
}

async function saveProgressDoc(progress, modifiedFields = []) {
  modifiedFields.forEach((field) => progress.markModified(field));
  await progress.save();
}

/** Recalculate completion for a topic entry given its totalSubtopics */
function refreshTopicCompletion(entry) {
  const total = Math.max(entry.totalSubtopics || 0, 1);
  const done = entry.completedSubtopics.length;
  entry.completionPercentage = Math.round((done / total) * 100);
  entry.status =
    entry.completionPercentage >= 100
      ? "completed"
      : entry.completionPercentage > 0 || entry.openedAt
        ? "in_progress"
        : "not_started";
}

// ─── Problem progress ─────────────────────────────────────────────────────────

/**
 * POST /api/progress/problems/:problemId/complete
 * Mark a problem as solved (idempotent).
 */
async function completeProblem(req, res, next) {
  try {
    const problemId = parsePositiveProblemId(req.params.problemId);

    const { title, tags, topicId, subject } = readProgressPayload(req.body);
    const dateKey = toDateKey();
    const progress = req.progress;
    const entry = progress.getProblemProgress(problemId, subject);

    const wasSolved = entry.status === "solved";
    entry.title = title || entry.title;
    entry.tags = tags.length ? tags : entry.tags;
    entry.topicId = topicId || entry.topicId;
    entry.subject = subject || entry.subject;
    entry.status = "solved";
    entry.openedAt = entry.openedAt || new Date();
    entry.solvedAt = entry.solvedAt || new Date();
    entry.lastAttemptAt = new Date();

    // Legacy flat array still lives on the User doc — update it separately.
    if (!req.user.solvedProblems.includes(problemId)) {
      req.user.solvedProblems.push(problemId);
      await req.user.save();

      // check for a milestone (5, 10, 25 solved, etc) and email if
      // one was just hit. Fire-and-forget — never blocks the response, and
      // any failure is only logged (see notificationService).
      checkMilestones(req.user, req.user.solvedProblems.length);
    }

    if (!wasSolved) {
      const day = progress.getActivityDay(dateKey);
      day.solved += 1;
      progress.pushRecentEvent({
        id: makeEventId("problem_solved"),
        type: "problem_solved",
        createdAt: new Date(),
        problemId,
        title: entry.title,
      });
    }

    await saveProgressDoc(progress, ["problemProgress", "activityLog", "recentEvents"]);

    res.status(200).json({
      success: true,
      message: "Problem marked as completed.",
      user: sanitizeUser(req.user),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/progress/problems/:problemId/uncomplete
 * Un-mark a problem as solved.
 */
async function uncompleteProblem(req, res, next) {
  try {
    const problemId = parsePositiveProblemId(req.params.problemId);
    const progress = req.progress;

    const entry = progress.getProblemProgress(problemId);
    if (entry.status === "solved") {
      entry.status = entry.attempts > 0 ? "attempted" : "not_started";
      entry.solvedAt = null;
    }

    if (req.user.solvedProblems.includes(problemId)) {
      req.user.solvedProblems = req.user.solvedProblems.filter((id) => id !== problemId);
      await req.user.save();
    }

    await saveProgressDoc(progress, ["problemProgress"]);

    res.status(200).json({
      success: true,
      message: "Problem un-marked.",
      user: sanitizeUser(req.user),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/progress/problems/:problemId/attempt
 * Record a problem attempt.
 */
async function recordAttempt(req, res, next) {
  try {
    const problemId = parsePositiveProblemId(req.params.problemId);

    const { title, tags, topicId, subject } = readProgressPayload(req.body);
    const dateKey = toDateKey();
    const progress = req.progress;
    const entry = progress.getProblemProgress(problemId, subject);

    entry.attempts += 1;
    entry.status = entry.status === "solved" ? "solved" : "attempted";
    entry.openedAt = entry.openedAt || new Date();
    entry.lastAttemptAt = new Date();
    entry.title = title || entry.title;
    entry.tags = tags.length ? tags : entry.tags;
    entry.topicId = topicId || entry.topicId;
    entry.subject = subject || entry.subject;

    const day = progress.getActivityDay(dateKey);
    day.attempts += 1;

    progress.pushRecentEvent({
      id: makeEventId("problem_attempted"),
      type: "problem_attempted",
      createdAt: new Date(),
      problemId,
      title: entry.title,
    });

    await saveProgressDoc(progress, ["problemProgress", "activityLog", "recentEvents"]);

    res.status(200).json({ success: true, message: "Attempt recorded." });
  } catch (error) {
    next(error);
  }
}

// ─── Topic progress ───────────────────────────────────────────────────────────

/**
 * POST /api/progress/topics/:topicId/open
 * Mark a topic as opened / in_progress.
 */
async function openTopic(req, res, next) {
  try {
    const { topicId } = req.params;
    const { title, totalSubtopics, subject } = readProgressPayload(req.body);
    const dateKey = toDateKey();
    const progress = req.progress;
    const entry = progress.getTopicProgress(topicId, subject);

    entry.title = title || entry.title;
    if (totalSubtopics !== undefined) entry.totalSubtopics = Number(totalSubtopics);
    entry.openedAt = entry.openedAt || new Date();
    if (entry.status !== "completed") entry.status = "in_progress";
    entry.subject = subject || entry.subject;
    refreshTopicCompletion(entry);

    const day = progress.getActivityDay(dateKey);
    day.topicsOpened += 1;

    progress.pushRecentEvent({
      id: makeEventId("topic_opened"),
      type: "topic_opened",
      createdAt: new Date(),
      topicId,
      title: entry.title,
    });

    await saveProgressDoc(progress, ["topicProgress", "activityLog", "recentEvents"]);

    res.status(200).json({
      success: true,
      message: "Topic opened.",
      topicProgress: entry,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/progress/topics/:topicId/subtopics/:subtopicId
 * Toggle a subtopic as completed/incomplete.
 */
async function toggleSubtopic(req, res, next) {
  try {
    const { topicId, subtopicId } = req.params;
    const { title, totalSubtopics, subject } = readProgressPayload(req.body);
    const equivalentSubtopicIds = req.body?.equivalentSubtopicIds || [];
    const dateKey = toDateKey();
    const progress = req.progress;
    const entry = progress.getTopicProgress(topicId, subject);

    entry.title = title || entry.title;
    if (totalSubtopics !== undefined) entry.totalSubtopics = Number(totalSubtopics);
    entry.openedAt = entry.openedAt || new Date();
    entry.subject = subject || entry.subject;

    const completed = new Set(entry.completedSubtopics);
    const equivalentIds = Array.from(
      new Set([subtopicId, ...equivalentSubtopicIds].filter(Boolean)),
    );
    const isCompleted = equivalentIds.some((id) => completed.has(id));

    if (isCompleted) {
      equivalentIds.forEach((id) => completed.delete(id));
    } else {
      completed.add(subtopicId);
    }
    entry.completedSubtopics = Array.from(completed);

    const wasCompleted = entry.status === "completed";
    refreshTopicCompletion(entry);

    if (!wasCompleted && entry.status === "completed") {
      entry.completedAt = new Date();
      const day = progress.getActivityDay(dateKey);
      day.topicsCompleted += 1;

      progress.pushRecentEvent({
        id: makeEventId("topic_completed"),
        type: "topic_completed",
        createdAt: new Date(),
        topicId,
        title: entry.title,
      });
    }

    await saveProgressDoc(progress, ["topicProgress", "activityLog", "recentEvents"]);

    res.status(200).json({
      success: true,
      message: "Subtopic toggled.",
      topicProgress: entry,
    });
  } catch (error) {
    next(error);
  }
}

// ─── Full state snapshot ──────────────────────────────────────────────────────

/**
 * GET /api/progress/snapshot
 * Return the user's full progress state so the frontend can hydrate itself.
 */
async function getSnapshot(req, res, next) {
  try {
    const progress = req.progress;

    const problems = {};
    (progress.problemProgress || []).forEach((p) => {
      problems[p.problemId] = {
        attempts: p.attempts,
        status: p.status,
        openedAt: p.openedAt,
        lastAttemptAt: p.lastAttemptAt,
        solvedAt: p.solvedAt,
        title: p.title,
        tags: p.tags,
        topicId: p.topicId,
        subject: p.subject || "dld",
      };
    });

    const topics = {};
    (progress.topicProgress || []).forEach((t) => {
      topics[t.topicId] = {
        status: t.status,
        openedAt: t.openedAt,
        completedAt: t.completedAt,
        completionPercentage: t.completionPercentage,
        completedSubtopics: t.completedSubtopics,
        totalSubtopics: t.totalSubtopics,
        title: t.title,
        subject: t.subject || "dld",
      };
    });

    const activity = {};
    (progress.activityLog || []).forEach((d) => {
      activity[d.dateKey] = {
        attempts: d.attempts,
        solved: d.solved,
        topicsCompleted: d.topicsCompleted,
        topicsOpened: d.topicsOpened,
      };
    });

    res.status(200).json({
      success: true,
      state: {
        problems,
        topics,
        activity,
        recentEvents: progress.recentEvents || [],
      },
    });
  } catch (error) {
    next(error);
  }
}

const getProgress = getSnapshot;

module.exports = {
  completeProblem,
  uncompleteProblem,
  recordAttempt,
  openTopic,
  toggleSubtopic,
  getSnapshot,
  getProgress,
};
