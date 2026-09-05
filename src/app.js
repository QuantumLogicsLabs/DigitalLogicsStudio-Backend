const express = require("express");
const compression = require("compression");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");

const authRoutes = require("./routes/authRoutes");
const healthRoutes = require("./routes/healthRoutes");
const progressRoutes = require("./routes/progressRoutes");
const aiRoutes = require("./routes/aiRoutes");
const internalRoutes = require("./routes/internalRoutes");
const circuitRoutes = require("./routes/circuitRoutes");
const problemRoutes = require("./routes/problemRoutes");

const { errorHandler, notFound } = require("./middleware/errorMiddleware");

dotenv.config();

const app = express();

// ─── Trust proxy (required on Vercel / behind load balancers) ────────────────
app.set("trust proxy", 1);

// ─── Body parsers ────────────────────────────────────────────────────────────
// NEW: PATCH /api/auth/profile accepts a base64 avatar image, which blows
// past the default 10kb limit (a 5MB photo — the frontend's own cap — is
// ~6.7MB once base64-encoded). Rather than raising the limit for the whole
// API, we mount a path-scoped parser with a larger limit *before* the
// general one. body-parser skips re-parsing a request whose body has
// already been read (`req._body`), so this only affects this one route —
// every other route still gets the strict 10kb ceiling from SECURITY.md.
app.use("/api/auth/profile", express.json({ limit: "8mb" }));

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());
app.use(
  compression({
    threshold: 0,
  }),
);

app.use((req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// ─── CORS ────────────────────────────────────────────────────────────────────
const normalizeOrigin = (origin) => origin?.trim().replace(/\/+$/, "");

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3000/",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "https://circuits.quantumlogicslimited.com",
  "https://www.circuits.quantumlogicslimited.com",
  "https://digital-logics-studio.vercel.app",
  "https://digital-logics-studio-seven.vercel.app",
  "https://circuit.quantumlogicslimited.com",
  "https://digital-logics-studio-kccbyx2bo-seno-quantum-coders-projects.vercel.app",
  ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : []),
]
  .map(normalizeOrigin)
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const normalized = normalizeOrigin(origin);
    if (allowedOrigins.includes(normalized)) {
      return callback(null, true);
    }
    if (
      process.env.NODE_ENV !== "production" &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
    ) {
      return callback(null, true);
    }
    callback(new Error(`CORS policy blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Set-Cookie"],
};

app.use(cors(corsOptions));

// ─── Handle OPTIONS preflight explicitly ─────────────────────────────────────
// Vercel serverless functions don't auto-handle OPTIONS — without this the
// browser's preflight request gets a 404 with no CORS headers, blocking all
// cross-origin requests in production.
app.options("*", cors(corsOptions));

// ─── Swagger UI ──────────────────────────────────────────────────────────────
{
  const swaggerUi = require("swagger-ui-express");
  const swaggerSpec = require("./config/swagger");

  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: "Digital Logics Studio — API Docs",
      swaggerOptions: { withCredentials: true },
    }),
  );

  app.get("/api/docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
}

// ─── Root ping ───────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Digital Logics Studio backend is running.",
  });
});

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/internal", internalRoutes);
app.use("/api/trainer-board", circuitRoutes);
app.use("/api/problems", problemRoutes);

// ─── Error handlers ──────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
