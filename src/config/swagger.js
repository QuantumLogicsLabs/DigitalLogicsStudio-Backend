const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Digital Logics Studio API",
      version: "1.0.0",
      description:
        "REST API for Digital Logics Studio — handles authentication and user progress tracking.",
    },
    servers: [
      {
        url: "http://localhost:5000",
        description: "Local development server",
      },
      {
        url: "https://digital-logics-studio-backend.vercel.app",
        description: "Production server",
      },
    ],
    components: {
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c0d" },
            name: { type: "string", example: "Saad Amin" },
            email: { type: "string", example: "saad@example.com" },
            solvedProblems: {
              type: "array",
              items: { type: "integer" },
              example: [1, 3, 7],
            },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        ProblemProgress: {
          type: "object",
          properties: {
            problemId: { type: "integer", example: 5 },
            title: { type: "string", example: "Half Adder" },
            tags: {
              type: "array",
              items: { type: "string" },
              example: ["Combinational", "Arithmetic"],
            },
            topicId: { type: "string", example: "arithmetic" },
            subject: {
              type: "string",
              enum: ["dld", "coal"],
              example: "dld",
            },
            status: {
              type: "string",
              enum: ["not_started", "attempted", "solved"],
              example: "solved",
            },
            attempts: { type: "integer", example: 2 },
            openedAt: { type: "string", format: "date-time", nullable: true },
            lastAttemptAt: { type: "string", format: "date-time", nullable: true },
            solvedAt: { type: "string", format: "date-time", nullable: true },
          },
        },
        TopicProgress: {
          type: "object",
          properties: {
            topicId: { type: "string", example: "boolean-algebra" },
            title: { type: "string", example: "Boolean Algebra" },
            subject: {
              type: "string",
              enum: ["dld", "coal"],
              example: "dld",
            },
            status: {
              type: "string",
              enum: ["not_started", "in_progress", "completed"],
              example: "in_progress",
            },
            openedAt: { type: "string", format: "date-time", nullable: true },
            completedAt: { type: "string", format: "date-time", nullable: true },
            completionPercentage: { type: "integer", example: 50 },
            completedSubtopics: {
              type: "array",
              items: { type: "string" },
              example: ["boolean-laws"],
            },
            totalSubtopics: { type: "integer", example: 8 },
          },
        },
        ActivityDay: {
          type: "object",
          properties: {
            dateKey: { type: "string", example: "2026-06-01" },
            attempts: { type: "integer", example: 3 },
            solved: { type: "integer", example: 1 },
            topicsCompleted: { type: "integer", example: 0 },
            topicsOpened: { type: "integer", example: 1 },
          },
        },
        ActivityLog: {
          type: "object",
          required: ["userId", "action", "timestamp"],
          properties: {
            id: { type: "string", example: "log_664f1a2b3c4d5e6f7a8b9c0d" },
            userId: { type: "string", example: "664f1a2b3c4d5e6f7a8b9c0d" },
            action: { 
              type: "string", 
              enum: ["problem_attempted", "problem_solved", "topic_opened", "topic_completed"],
              example: "problem_solved" 
            },
            details: {
              type: "object",
              properties: {
                problemId: { type: "integer", example: 5 },
                topicId: { type: "string", example: "boolean-algebra" },
                subject: { type: "string", example: "dld" }
              }
            },
            timestamp: { type: "string", format: "date-time" }
          }
        },
        RecentEvent: {
          type: "object",
          properties: {
            id: { type: "string", example: "problem_solved-1710739200000-ab12cd" },
            type: {
              type: "string",
              enum: ["problem_attempted", "problem_solved", "topic_opened", "topic_completed"],
              example: "problem_solved",
            },
            createdAt: { type: "string", format: "date-time" },
            problemId: { type: "integer", nullable: true },
            topicId: { type: "string", nullable: true },
            subtopicId: { type: "string", nullable: true },
            title: { type: "string", example: "Half Adder" },
          },
        },
        ProgressState: {
          type: "object",
          properties: {
            problems: {
              type: "object",
              additionalProperties: { $ref: "#/components/schemas/ProblemProgress" },
            },
            topics: {
              type: "object",
              additionalProperties: { $ref: "#/components/schemas/TopicProgress" },
            },
            activity: {
              type: "object",
              additionalProperties: { $ref: "#/components/schemas/ActivityDay" },
            },
            recentEvents: {
              type: "array",
              items: { $ref: "#/components/schemas/RecentEvent" },
            },
          },
        },
        // ── Problem catalog (added: previously undocumented /api/problems routes) ──
        Problem: {
          type: "object",
          description: "A DLD circuit problem or COAL conceptual problem, as returned by the API.",
          properties: {
            id: { type: "integer", example: 5, description: "Numeric problem id, unique across the catalog." },
            listId: { type: "string", example: "DLD-0005", description: "Human-readable catalog id, auto-derived from course + id if not supplied." },
            course: { type: "string", enum: ["dld", "coal"], example: "dld" },
            title: { type: "string", example: "Half Adder" },
            difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"], example: "Easy" },
            tags: {
              type: "array",
              items: { type: "string" },
              example: ["Combinational", "Arithmetic"],
            },
            topic: { type: "string", example: "arithmetic-circuits" },
            description: { type: "string", example: "Build a half adder that outputs Sum and Carry for two 1-bit inputs." },
            truthTable: {
              type: "array",
              description: "One object per row, keyed by the declared inputs/outputs. Empty for non-circuit (e.g. COAL) problems.",
              items: {
                type: "object",
                additionalProperties: true,
                example: { A: 0, B: 0, Sum: 0, Carry: 0 },
              },
            },
            equations: {
              type: "array",
              items: { type: "string" },
              example: ["Sum = A ⊕ B", "Carry = A . B"],
            },
            hint: { type: "string", example: "Think about what XOR and AND each give you here." },
            inputs: {
              type: "array",
              items: { type: "string" },
              example: ["A", "B"],
            },
            outputs: {
              type: "array",
              items: { type: "string" },
              example: ["Sum", "Carry"],
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ProblemInput: {
          type: "object",
          description: "Request body for creating or updating a problem. `id` is required for create and ignored for update (the path param wins).",
          required: ["title", "difficulty", "course", "inputs", "outputs"],
          properties: {
            id: { type: "integer", example: 5, description: "Required when creating; must not already exist." },
            listId: { type: "string", example: "DLD-0005", description: "Optional — auto-derived from course + id if omitted." },
            course: { type: "string", enum: ["dld", "coal"], example: "dld" },
            title: { type: "string", example: "Half Adder" },
            difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"], example: "Easy" },
            tags: {
              type: "array",
              items: { type: "string" },
              example: ["Combinational", "Arithmetic"],
            },
            topic: { type: "string", example: "arithmetic-circuits" },
            description: { type: "string", example: "Build a half adder that outputs Sum and Carry for two 1-bit inputs." },
            truthTable: {
              type: "array",
              description: "Leave as [] for non-circuit problems. If supplied, must have exactly 2^inputs.length rows, each keyed by exactly the declared inputs + outputs.",
              items: {
                type: "object",
                additionalProperties: true,
                example: { A: 0, B: 0, Sum: 0, Carry: 0 },
              },
            },
            equations: {
              type: "array",
              items: { type: "string" },
              example: ["Sum = A ⊕ B", "Carry = A . B"],
            },
            hint: { type: "string", example: "Think about what XOR and AND each give you here." },
            inputs: {
              type: "array",
              items: { type: "string" },
              example: ["A", "B"],
            },
            outputs: {
              type: "array",
              items: { type: "string" },
              example: ["Sum", "Carry"],
            },
          },
        },
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string" },
            stack: {
              type: "string",
              description: "Only present in development mode",
            },
          },
        },
      },
      // Note: cookie-authenticated user routes use httpOnly cookies — no Bearer
      // token needed in Swagger UI for those. The /api/auth/login endpoint sets
      // the cookie automatically. To test protected routes in Swagger UI, first
      // call /api/auth/login, then the browser session cookie will be forwarded
      // on subsequent requests (works when Swagger UI is on the same origin as
      // the API).
      //
      // securitySchemes below is for the separate /api/internal/* routes, which
      // are NOT cookie-authenticated — they use a static Bearer token that must
      // match the CRON_SECRET environment variable (added alongside the new
      // /api/internal/* Swagger docs).
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Static bearer token that must equal the CRON_SECRET environment variable. Vercel Cron sends this automatically on scheduled invocations.",
        },
      },
    },
  },
  apis: ["./src/routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
