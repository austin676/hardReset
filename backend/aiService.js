/**
 * aiService.js
 * -------------
 * Generates a personalised coding performance report for a player
 * using the Groq API (llama-3.3-70b-versatile — free tier friendly).
 *
 * Called at game end with the accumulated attempt data for each player.
 *
 * Attempt shape (per task):
 * {
 *   taskId:     string,
 *   domain:     string,        // "dsa" | "oops" | "frontend"
 *   language:   string,        // "python" | "javascript"
 *   prompt:     string,        // task description
 *   attempts:   number,        // total submit attempts
 *   passed:     boolean,       // whether they eventually solved it
 *   finalCode:  string | null, // code on final (passing) attempt
 *   triedCodes: string[],      // code snapshots from failed attempts
 * }
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

/**
 * Build a structured prompt for the Groq model.
 * @param {string} playerName
 * @param {object[]} attempts - array of attempt objects described above
 * @returns {string}
 */
function buildPrompt(playerName, attempts) {
  const lines = attempts.map((a, i) => {
    const status       = a.passed ? '✅ PASSED' : '❌ NOT SOLVED';
    const attemptLabel = `${a.attempts} attempt${a.attempts === 1 ? '' : 's'}`;
    const codeSnippet  = a.finalCode
      ? `\nFinal code:\n\`\`\`${a.language}\n${a.finalCode.slice(0, 600)}\n\`\`\``
      : a.triedCodes.length
      ? `\nLast attempt:\n\`\`\`${a.language}\n${a.triedCodes[a.triedCodes.length - 1]?.slice(0, 400)}\n\`\`\``
      : '';

    return `Task ${i + 1}: [${a.domain.toUpperCase()}] ${a.prompt}
Status: ${status} | Attempts: ${attemptLabel}${codeSnippet}`;
  });

  return `You are a coding coach. Analyse the following performance data for player "${playerName}" and write a concise, encouraging report.

${lines.join('\n\n')}

Write the report in this exact structure:
## Performance Report

**Overall Score: X/10**

### ✅ Strengths
- (what they did well, based on domains passed + attempt count)

### ⚠️ Areas to Improve
- (specific weak domains/concepts shown by failures or many attempts)

### 📝 Code Quality Observations
- (brief notes on their approach if code was provided)

### 🎯 Recommended Practice
1. (specific actionable tip)
2. (another tip)
3. (another tip)

Keep each section to 2-3 bullet points. Be specific to the domains (dsa, oops, frontend). Be encouraging but honest.`;
}

/**
 * Generate an AI report for a single player.
 *
 * @param {string} playerName
 * @param {object[]} attempts
 * @returns {Promise<string>} markdown report text
 */
async function generateReport(playerName, attempts) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    console.warn('[aiService] GROQ_API_KEY not set — returning fallback report');
    return buildFallbackReport(playerName, attempts);
  }

  try {
    const response = await fetch(GROQ_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       GROQ_MODEL,
        messages: [
          {
            role:    'system',
            content: 'You are a precise, encouraging coding coach. Output only the report in markdown, no preamble.',
          },
          {
            role:    'user',
            content: buildPrompt(playerName, attempts),
          },
        ],
        max_tokens:   800,
        temperature:  0.6,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Groq API ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? buildFallbackReport(playerName, attempts);
  } catch (err) {
    console.error('[aiService] generateReport error:', err.message);
    return buildFallbackReport(playerName, attempts);
  }
}

/**
 * Deterministic fallback if Groq is unavailable.
 */
function buildFallbackReport(playerName, attempts) {
  const passed  = attempts.filter((a) => a.passed);
  const failed  = attempts.filter((a) => !a.passed);
  const avgAtt  = attempts.length
    ? (attempts.reduce((s, a) => s + a.attempts, 0) / attempts.length).toFixed(1)
    : 0;
  const score   = Math.min(10, Math.round((passed.length / Math.max(attempts.length, 1)) * 10));

  const strongDomains = [...new Set(passed.map((a) => a.domain))];
  const weakDomains   = [...new Set(failed.map((a) => a.domain))];

  return `## Performance Report

**Overall Score: ${score}/10**

### ✅ Strengths
${strongDomains.length ? strongDomains.map((d) => `- Solved ${d.toUpperCase()} tasks`).join('\n') : '- Showed persistence across all tasks'}
- Completed ${passed.length} of ${attempts.length} tasks

### ⚠️ Areas to Improve
${weakDomains.length ? weakDomains.map((d) => `- Review ${d.toUpperCase()} fundamentals`).join('\n') : '- Focus on reducing attempt count (avg: ${avgAtt})'}

### 📝 Code Quality Observations
- Average ${avgAtt} attempts per task
- ${passed.length === attempts.length ? 'All tasks completed — great consistency!' : 'Some tasks not completed — practice is key'}

### 🎯 Recommended Practice
1. Review tasks you did not complete and solve them locally
2. Practice the domains: ${(weakDomains.length ? weakDomains : strongDomains).join(', ')}
3. Aim to solve tasks in fewer attempts by reading prompts carefully`;
}

module.exports = { generateReport };
