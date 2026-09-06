const User = require("../models/User");
const UserProgress = require("../models/UserProgress");
const EmailQueue = require("../models/EmailQueue");
const {
  assertAuthConfig,
  clearAuthCookie,
  generateToken,
  setAuthCookie,
} = require("../utils/token");
const { createHttpError } = require("../utils/httpError");
const { sendPasswordResetOTP } = require("../utils/email");
const {
  OTP_TTL_MS,
  RESET_TOKEN_TTL_MS,
  MAX_OTP_ATTEMPTS,
  generateOTP,
  hashValue,
  generateResetToken,
} = require("../utils/otp");
const { sendWelcomeNotification } = require("../services/notificationService");

// Data-URL avatars are stored inline on the User document (see
// models/User.js for why). This caps the *encoded* string length so a
// malformed/oversized payload fails with a clear 400 instead of relying
// solely on the body-parser's 413. Kept a little above the frontend's 5MB
// raw-file cap to account for base64's ~33% size inflation.
const MAX_AVATAR_DATA_URL_LENGTH = 7 * 1024 * 1024; // ~7MB of encoded text

function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role || "student",
    avatarUrl: user.avatarUrl || null,
    solvedProblems: user.solvedProblems || [],
    createdAt: user.createdAt,
    emailNotificationsOptedOut: user.notifications?.optedOut || false,
  };
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function mapDuplicateKeyError(error) {
  if (error?.code !== 11000) return null;

  const field = Object.keys(error.keyPattern || {})[0];
  if (field === "email") {
    return createHttpError(409, "An account with this email already exists.");
  }

  return createHttpError(
    409,
    "An account with these details already exists. Try logging in instead.",
  );
}

async function registerUser(req, res, next) {
  try {
    assertAuthConfig();

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      throw createHttpError(400, "Name, email, and password are required.");
    }

    if (name.trim().length < 2) {
      throw createHttpError(400, "Name must be at least 2 characters long.");
    }

    if (!validateEmail(email)) {
      throw createHttpError(400, "Please provide a valid email address.");
    }

    if (password.length < 8) {
      throw createHttpError(400, "Password must be at least 8 characters long.");
    }

    const normalizedEmail = normalizeEmail(email);
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      throw createHttpError(409, "An account with this email already exists.");
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
    });

    const token = generateToken(user._id.toString());
    setAuthCookie(res, token);

    sendWelcomeNotification(user);

    res.status(201).json({
      success: true,
      message: "Account created successfully.",
      user: sanitizeUser(user),
    });
  } catch (error) {
    const duplicateError = mapDuplicateKeyError(error);
    next(duplicateError || error);
  }
}

async function loginUser(req, res, next) {
  try {
    assertAuthConfig();

    const { email, password } = req.body;

    if (!email || !password) {
      throw createHttpError(400, "Email and password are required.");
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    if (!user || !(await user.matchPassword(password))) {
      throw createHttpError(401, "Invalid email or password.");
    }

    const token = generateToken(user._id.toString());
    setAuthCookie(res, token);

    res.status(200).json({
      success: true,
      message: `Welcome back, ${user.name}.`,
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
}

function logoutUser(req, res) {
  clearAuthCookie(res);

  res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
}

function getCurrentUser(req, res) {
  res.status(200).json({
    success: true,
    user: sanitizeUser(req.user),
  });
}

const GENERIC_OTP_MESSAGE =
  "If an account exists for that email, a verification code has been sent.";

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    if (!email || !validateEmail(email)) {
      throw createHttpError(400, "Please provide a valid email address.");
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(200).json({ success: true, message: GENERIC_OTP_MESSAGE });
    }

    const otp = generateOTP();

    user.resetPassword = {
      otpHash: hashValue(otp),
      otpExpires: new Date(Date.now() + OTP_TTL_MS),
      otpAttempts: 0,
      tokenHash: null,
      tokenExpires: null,
    };
    await user.save({ validateBeforeSave: false });

    try {
      await sendPasswordResetOTP(user.email, user.name, otp);
    } catch (emailError) {
      user.resetPassword = { otpHash: null, otpExpires: null, otpAttempts: 0 };
      await user.save({ validateBeforeSave: false });
      throw createHttpError(502, "Failed to send verification email. Please try again.");
    }

    res.status(200).json({ success: true, message: GENERIC_OTP_MESSAGE });
  } catch (error) {
    next(error);
  }
}

async function verifyResetOtp(req, res, next) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      throw createHttpError(400, "Email and verification code are required.");
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+resetPassword.otpHash +resetPassword.otpExpires +resetPassword.otpAttempts",
    );

    if (!user || !user.resetPassword?.otpHash || !user.resetPassword?.otpExpires) {
      throw createHttpError(400, "Invalid or expired verification code.");
    }

    if (user.resetPassword.otpExpires.getTime() < Date.now()) {
      user.resetPassword = { otpHash: null, otpExpires: null, otpAttempts: 0 };
      await user.save({ validateBeforeSave: false });
      throw createHttpError(400, "Invalid or expired verification code.");
    }

    if (user.resetPassword.otpAttempts >= MAX_OTP_ATTEMPTS) {
      user.resetPassword = { otpHash: null, otpExpires: null, otpAttempts: 0 };
      await user.save({ validateBeforeSave: false });
      throw createHttpError(
        429,
        "Too many incorrect attempts. Please request a new verification code.",
      );
    }

    if (hashValue(otp) !== user.resetPassword.otpHash) {
      user.resetPassword.otpAttempts += 1;
      await user.save({ validateBeforeSave: false });
      throw createHttpError(400, "Invalid or expired verification code.");
    }

    const resetToken = generateResetToken();
    user.resetPassword = {
      otpHash: null,
      otpExpires: null,
      otpAttempts: 0,
      tokenHash: hashValue(resetToken),
      tokenExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    };
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: "Code verified. You can now set a new password.",
      resetToken,
    });
  } catch (error) {
    next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { email, resetToken, password } = req.body;

    if (!email || !resetToken || !password) {
      throw createHttpError(400, "Email, reset token, and new password are required.");
    }

    if (password.length < 8) {
      throw createHttpError(400, "Password must be at least 8 characters long.");
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+resetPassword.tokenHash +resetPassword.tokenExpires",
    );

    if (
      !user ||
      !user.resetPassword?.tokenHash ||
      !user.resetPassword?.tokenExpires ||
      user.resetPassword.tokenExpires.getTime() < Date.now() ||
      hashValue(resetToken) !== user.resetPassword.tokenHash
    ) {
      throw createHttpError(400, "Invalid or expired reset session. Please start again.");
    }

    user.password = password;
    user.resetPassword = {
      otpHash: null,
      otpExpires: null,
      otpAttempts: 0,
      tokenHash: null,
      tokenExpires: null,
    };
    await user.save();

    clearAuthCookie(res);

    res.status(200).json({
      success: true,
      message: "Password reset successfully. Please log in with your new password.",
    });
  } catch (error) {
    next(error);
  }
}

async function updateNotificationPreferences(req, res, next) {
  try {
    const { optedOut } = req.body;

    if (typeof optedOut !== "boolean") {
      throw createHttpError(400, "optedOut must be a boolean.");
    }

    req.user.notifications.optedOut = optedOut;
    await req.user.save();

    res.status(200).json({
      success: true,
      message: optedOut
        ? "You've been unsubscribed from email notifications."
        : "Email notifications re-enabled.",
      user: sanitizeUser(req.user),
    });
  } catch (error) {
    next(error);
  }
}

// NEW — PATCH /api/auth/profile. Updates display name and/or avatar for the
// logged-in user. Both fields are optional but at least one must be
// present; send `avatarDataUrl: null` to remove an existing photo.
async function updateProfile(req, res, next) {
  try {
    const { name, avatarDataUrl } = req.body || {};

    if (name === undefined && avatarDataUrl === undefined) {
      throw createHttpError(400, "Provide a name and/or avatarDataUrl to update.");
    }

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (trimmed.length < 2 || trimmed.length > 60) {
        throw createHttpError(400, "Name must be between 2 and 60 characters long.");
      }
      req.user.name = trimmed;
    }

    if (avatarDataUrl !== undefined) {
      if (avatarDataUrl === null) {
        req.user.avatarUrl = null;
      } else {
        const isDataUrl =
          typeof avatarDataUrl === "string" && avatarDataUrl.startsWith("data:image/");

        if (!isDataUrl) {
          throw createHttpError(400, "avatarDataUrl must be a base64 image data URL.");
        }
        if (avatarDataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
          throw createHttpError(400, "Image is too large. Please choose a smaller photo.");
        }
        req.user.avatarUrl = avatarDataUrl;
      }
    }

    await req.user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated.",
      user: sanitizeUser(req.user),
    });
  } catch (error) {
    next(error);
  }
}

// PATCH-equivalent for password, but while already logged in (as opposed
// to forgotPassword's unauthenticated OTP flow). Implemented previously,
// now mounted at PATCH /api/auth/change-password.
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw createHttpError(400, "Current password and new password are required.");
    }

    if (newPassword.length < 8) {
      throw createHttpError(400, "New password must be at least 8 characters long.");
    }

    if (newPassword === currentPassword) {
      throw createHttpError(400, "New password must be different from your current password.");
    }

    // req.user from `protect` doesn't include +password — re-fetch it.
    const user = await User.findById(req.user._id).select("+password");

    if (!user || !(await user.matchPassword(currentPassword))) {
      throw createHttpError(401, "Current password is incorrect.");
    }

    user.password = newPassword; // pre-save hook re-hashes
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error) {
    next(error);
  }
}

// Permanently deletes the account and its associated data. Implemented
// previously, now mounted at POST /api/auth/delete-account. Requires the
// current password as confirmation.
async function deleteAccount(req, res, next) {
  try {
    const { password } = req.body;

    if (!password) {
      throw createHttpError(400, "Please confirm your password to delete your account.");
    }

    const user = await User.findById(req.user._id).select("+password");

    if (!user || !(await user.matchPassword(password))) {
      throw createHttpError(401, "Incorrect password.");
    }

    await Promise.all([
      UserProgress.deleteOne({ userId: user._id }),
      EmailQueue.deleteMany({ userId: user._id }),
      user.deleteOne(),
    ]);

    clearAuthCookie(res);

    res.status(200).json({
      success: true,
      message: "Your account and all associated data have been deleted.",
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  updateNotificationPreferences,
  updateProfile,
  changePassword,
  deleteAccount,
};
