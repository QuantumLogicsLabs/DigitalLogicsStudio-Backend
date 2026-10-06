const Groq = require("groq-sdk");

let groqClient = null;

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : null;

  if (!apiKey) {
    console.warn("[groq.js] GROQ_API_KEY environment variable is missing or empty.");
    return null;
  }

  // Return existing client if instantiated with a valid key
  if (groqClient) {
    return groqClient;
  }

  try {
    groqClient = new Groq({ apiKey });
    return groqClient;
  } catch (err) {
    console.error("[groq.js] Failed to initialize Groq SDK instance:", err.message || err);
    return null;
  }
}

const GROQ_DEFAULTS = {
  model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  maxTokens: process.env.GROQ_MAX_TOKENS ? parseInt(process.env.GROQ_MAX_TOKENS, 10) : 1024,
  temperature:
    process.env.GROQ_TEMPERATURE !== undefined
      ? parseFloat(process.env.GROQ_TEMPERATURE)
      : 0.5,
};

module.exports = { getGroqClient, GROQ_DEFAULTS };
