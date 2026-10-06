const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ─── User schema ───────────────────────────────────────────────────────────────
// NOTE: problemProgress, topicProgress, activityLog, and recentEvents used to
// live here. They've moved to the UserProgress collection (see
// models/UserProgress.js) so that `protect` no longer has to load them on
// every authenticated request. See scripts/migrateProgress.js for the
// one-time data migration.

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
      select: false,
    },

    role: {
      type: String,
      enum: ["student", "instructor", "admin"],
      default: "student",
    },

    // NEW — profile photo. Stored as a base64 data URL directly on the
    // document rather than in object storage/CDN: there is no file-storage
    // integration in this project yet, and at current traffic levels
    // (<10 visitors/hour) this is a pragmatic trade-off, not a permanent
    // architecture decision. See docs/AUTH_FLOW.md "Profile Update Flow"
    // for the size limit enforced on write.
    avatarUrl: {
      type: String,
      default: null,
    },

    // ── Legacy flat array kept for backward compat ──
    // Small enough (array of numbers) that it's cheap to keep on the user
    // doc; the detailed problem records live in UserProgress now.
    solvedProblems: {
      type: [Number],
      default: [],
    },

    // ── Password reset (forgot password via OTP) ──
    resetPassword: {
      otpHash: { type: String, select: false, default: null },
      otpExpires: { type: Date, select: false, default: null },
      otpAttempts: { type: Number, select: false, default: 0 },
      tokenHash: { type: String, select: false, default: null },
      tokenExpires: { type: Date, select: false, default: null },
    },

    // ── Email notification state ──
    // Tracks what's already been sent so scheduled jobs stay idempotent no
    // matter how often the cron/poller runs.
    notifications: {
      milestonesSent: { type: [Number], default: [] },
      lastDigestSentAt: { type: Date, default: null },
      lastInactivityReminderAt: { type: Date, default: null },
      // Single global opt-out switch. Kept simple on purpose — split into
      // per-type toggles later if you need finer control.
      optedOut: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  },
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function matchPassword(enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
