const { executeQuantum } = require("../services/execute.service");

async function execute(req, res) {
  const { ext, code } = req.body || {};

  if (typeof code !== "string" || code.trim() === "") {
    return res.status(400).json({
      success: false,
      output: "",
      hasWarnings: false,
      error: "Code cannot be empty",
      compilerError: null,
    });
  }

  try {
    const result = await executeQuantum(code, ext);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      output: "",
      hasWarnings: false,
      error: "Internal execution error",
      compilerError: null,
    });
  }
}

module.exports = { execute };