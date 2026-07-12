const { execFile } = require("child_process");
const { writeFile, unlink, mkdir } = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const RUN_BIN = process.env.QUANTUM_BIN || "./bin/qrun";
const TIMEOUT_MS = Number(process.env.EXEC_TIMEOUT_MS) || 5000;
const TMP_DIR = process.env.EXEC_TMP_DIR || "./tmp";
const MAX_CODE_BYTES = Number(process.env.EXEC_MAX_CODE_BYTES) || 100000;
const MAX_OUTPUT_BYTES = Number(process.env.EXEC_MAX_OUTPUT_BYTES) || 1000000;
const ALLOWED_EXT = new Set([".sa"]);

const COMPILE_ERROR_RE = /(parseerror|syntaxerror|lexerror|compileerror|parse error|syntax error|compile|unexpected token|type error)/i;

// Strip terminal color/escape codes so the API returns clean text.
function stripAnsi(text) {
  return text.replace(/\x1B\[[0-9;]*m/g, "");
}

// Replace the internal temp file path with a neutral name.
function cleanPath(text, file) {
  const base = path.basename(file);
  return text.split(base).join("script.sa").split(file).join("script.sa");
}

function buildResult({ success = false, output = "", hasWarnings = false, error = null, compilerError = null }) {
  return { success, output, hasWarnings, error, compilerError };
}

function truncate(text) {
  if (text.length <= MAX_OUTPUT_BYTES) return text;
  return text.slice(0, MAX_OUTPUT_BYTES) + "\n...[output truncated]";
}

function runProcess(bin, args) {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({ err, stdout: stdout || "", stderr: stderr || "" });
      }
    );
  });
}

async function executeQuantum(code, ext) {
  if (typeof code !== "string" || code.trim() === "") {
    return buildResult({ error: "Code cannot be empty" });
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return buildResult({ error: "Code exceeds maximum allowed size" });
  }

  const safeExt = ALLOWED_EXT.has(ext) ? ext : ".sa";
  await mkdir(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, `${crypto.randomUUID()}${safeExt}`);
  await writeFile(file, code, "utf8");

  try {
    const run = await runProcess(RUN_BIN, [file]);
    const output = truncate(cleanPath(stripAnsi(run.stdout), file));
    const errText = cleanPath(stripAnsi(run.stderr), file).trim();
    const hasWarnings = /warning/i.test(errText);

    if (run.err && run.err.killed) {
      return buildResult({ output, hasWarnings, error: "Execution timed out" });
    }

    if (run.err && run.err.code) {
      const normalized = errText.replace(/\s+/g, " ");
      if (COMPILE_ERROR_RE.test(normalized)) {
        return buildResult({ output, hasWarnings, compilerError: errText || "Compilation failed" });
      }
      return buildResult({ output, hasWarnings, error: errText || "Runtime error" });
    }

    return buildResult({ success: true, output, hasWarnings });
  } catch (err) {
    return buildResult({ error: "Internal execution failure" });
  } finally {
    unlink(file).catch(() => {});
  }
}

module.exports = { executeQuantum };