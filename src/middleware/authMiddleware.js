const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { createHttpError } = require("../utils/httpError");

// Only the fields actually needed for auth checks + the lightweight
// legacy solvedProblems array. Progress detail lives in UserProgress now,
// so this query no longer pulls it in on every request.
//
// FIX: "notifications" was missing here — that's the field the milestone
// checker and the /auth/notifications toggle both depend on, so every
// req.user built by this middleware previously had `notifications ===
// undefined`. checkMilestones() and sanitizeUser()'s emailNotificationsOptedOut
// silently did nothing/returned false because of this.
const AUTH_SELECT_FIELDS = "_id name email createdAt solvedProblems notifications";

async function protect(req, res, next) {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return next(
        createHttpError(
          401,
          "Kindly log in or sign up for a better experience and to save your progress.",
        ),
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select(AUTH_SELECT_FIELDS);

    if (!user) {
      return next(createHttpError(401, "User account no longer exists."));
    }

    req.user = user;
    next();
  } catch (error) {
    return next(createHttpError(401, "Session is invalid or has expired."));
  }
}

module.exports = { protect };
