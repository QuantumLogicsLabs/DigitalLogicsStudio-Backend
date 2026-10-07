const mongoose = require("mongoose");

// ─── Sub-schemas ─────────────────────────────────────────────────────────────
// (moved here from User.js — they only belong to progress now)

const problemProgressSchema = new mongoose.Schema(
    {
        problemId: { type: Number, required: true },
        title: { type: String, default: "" },
        tags: { type: [String], default: [] },
        topicId: { type: String, default: null },
        // "dld" | "coal" — defaults to "dld" for backward compat with existing records
        subject: { type: String, enum: ["dld", "coal"], default: "dld" },
        status: {
            type: String,
            enum: ["not_started", "attempted", "solved"],
            default: "not_started",
        },
        attempts: { type: Number, default: 0 },
        openedAt: { type: Date, default: null },
        lastAttemptAt: { type: Date, default: null },
        solvedAt: { type: Date, default: null },
        // Set once and never cleared, unlike solvedAt (un-marking a problem
        // resets that). XP is dated on these, so it is earned once per problem
        // and can't be re-earned by toggling — see services/xpService.js.
        firstAttemptAt: { type: Date, default: null },
        firstSolvedAt: { type: Date, default: null },
    },
    { _id: false },
);

const topicProgressSchema = new mongoose.Schema(
    {
        topicId: { type: String, required: true },
        title: { type: String, default: "" },
        // "dld" | "coal" — defaults to "dld" for backward compat with existing records
        subject: { type: String, enum: ["dld", "coal"], default: "dld" },
        status: {
            type: String,
            enum: ["not_started", "in_progress", "completed"],
            default: "not_started",
        },
        openedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        completionPercentage: { type: Number, default: 0 },
        completedSubtopics: { type: [String], default: [] },
        // Day ("YYYY-MM-DD") each completed subtopic was marked as read, so the
        // activity calendar can count article reads. Older reads have no entry.
        subtopicReadDays: {
            type: [
                new mongoose.Schema(
                    {
                        subtopicId: { type: String, required: true },
                        dateKey: { type: String, required: true },
                    },
                    { _id: false },
                ),
            ],
            default: [],
        },
        totalSubtopics: { type: Number, default: 0 },
    },
    { _id: false },
);

const activityDaySchema = new mongoose.Schema(
    {
        dateKey: { type: String, required: true }, // "YYYY-MM-DD"
        attempts: { type: Number, default: 0 },
        solved: { type: Number, default: 0 },
        topicsCompleted: { type: Number, default: 0 },
        topicsOpened: { type: Number, default: 0 },
    },
    { _id: false },
);

const recentEventSchema = new mongoose.Schema(
    {
        id: { type: String },
        type: { type: String },
        createdAt: { type: Date, default: Date.now },
        problemId: { type: Number, default: null },
        topicId: { type: String, default: null },
        subtopicId: { type: String, default: null },
        title: { type: String, default: "" },
    },
    { _id: false },
);

// ─── Main UserProgress schema ─────────────────────────────────────────────────

const userProgressSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true,
        },
        problemProgress: { type: [problemProgressSchema], default: [] },
        topicProgress: { type: [topicProgressSchema], default: [] },
        activityLog: { type: [activityDaySchema], default: [] },
        recentEvents: { type: [recentEventSchema], default: [] },
    },
    { timestamps: true },
);

// ─── Helpers (moved from User.js, now operate on the progress doc) ───────────

/** Find or initialise a problemProgress entry. `subject` seeds new entries. */
userProgressSchema.methods.getProblemProgress = function (problemId, subject = "dld") {
    let entry = this.problemProgress.find((p) => p.problemId === problemId);
    if (!entry) {
        entry = { problemId, status: "not_started", attempts: 0, subject };
        this.problemProgress.push(entry);
        entry = this.problemProgress[this.problemProgress.length - 1];
    }
    return entry;
};

/** Find or initialise a topicProgress entry. `subject` seeds new entries. */
userProgressSchema.methods.getTopicProgress = function (topicId, subject = "dld") {
    let entry = this.topicProgress.find((t) => t.topicId === topicId);
    if (!entry) {
        entry = { topicId, status: "not_started", completedSubtopics: [], subject };
        this.topicProgress.push(entry);
        entry = this.topicProgress[this.topicProgress.length - 1];
    }
    return entry;
};

/** Upsert an activity day */
userProgressSchema.methods.getActivityDay = function (dateKey) {
    let day = this.activityLog.find((d) => d.dateKey === dateKey);
    if (!day) {
        day = { dateKey, attempts: 0, solved: 0, topicsCompleted: 0, topicsOpened: 0 };
        this.activityLog.push(day);
        day = this.activityLog[this.activityLog.length - 1];
    }
    return day;
};

/** Prepend a recent event (cap at 30) */
userProgressSchema.methods.pushRecentEvent = function (event) {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > 30) this.recentEvents = this.recentEvents.slice(0, 30);
};

/** Find an existing progress doc for a user, or create an empty one. */
userProgressSchema.statics.findOrCreateForUser = async function (userId) {
    let progress = await this.findOne({ userId });
    if (!progress) {
        progress = await this.create({ userId });
    }
    return progress;
};

module.exports = mongoose.model("UserProgress", userProgressSchema);