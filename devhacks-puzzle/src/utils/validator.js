/**
 * Compare the actual stdout from code execution against the expected output.
 * Both values are trimmed before comparison to ignore trailing newlines.
 *
 * @param {string|null} stdout         – raw stdout from execution
 * @param {string}      expectedOutput – expected output from the task definition
 * @returns {boolean}
 */
function validate(stdout, expectedOutput) {
    if (stdout === null || stdout === undefined) return false;
    return stdout.trim() === expectedOutput.trim();
}

module.exports = { validate };
