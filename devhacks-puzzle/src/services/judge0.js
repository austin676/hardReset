// src/services/judge0.js  –  Wandbox executor (no API key required)
const axios = require("axios");

const WANDBOX_URL = "https://wandbox.org/api/compile.json";

// Map language name → Wandbox compiler
const COMPILER_MAP = {
  python: "cpython-3.10.15",
  javascript: "nodejs-18.20.4",
};

console.log("Loaded Wandbox executor");

/**
 * Execute source code via the Wandbox public API.
 * @param {string} sourceCode – full source to execute
 * @param {string} language   – "python" | "javascript"
 * @returns {Promise<{stdout:string|null, stderr:string|null, time:number|null, memory:number|null}>}
 */
async function execute(sourceCode, language) {
  const compiler = COMPILER_MAP[language];
  if (!compiler) {
    throw new Error(`Unsupported language: ${language}`);
  }

  try {
    const { data } = await axios.post(
      WANDBOX_URL,
      {
        code: sourceCode,
        compiler,
      },
      { timeout: 30000 }
    );

    // Wandbox returns:
    //   status        – "0" on success
    //   program_output – stdout
    //   program_error  – stderr
    //   compiler_error – compilation errors (if any)
    const stdout = data.program_output || null;
    const stderr = data.program_error || data.compiler_error || null;

    return {
      stdout: stdout ? stdout.trimEnd() : null,
      stderr: stderr || null,
      time: null, // Wandbox doesn't expose timing
      memory: null,
    };
  } catch (err) {
    if (err.code === "ECONNABORTED") {
      throw new Error("Code execution timed out");
    }
    if (err.response) {
      throw new Error(
        `Wandbox API error (${err.response.status}): ${JSON.stringify(err.response.data)}`
      );
    }
    throw new Error(`Code execution failed: ${err.message}`);
  }
}

module.exports = { execute, COMPILER_MAP };