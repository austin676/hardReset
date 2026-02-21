/**
 * taskGenerator.js
 * ----------------
 * Uses Groq (llama-3.3-70b) to generate a personalised coding task
 * for a player based on their selected topics and preferred language.
 *
 * Generated task shape:
 * {
 *   id:             string,   // unique slug
 *   domain:         string,   // topic slug e.g. "arrays"
 *   language:       string,   // "python" | "javascript"
 *   prompt:         string,   // task description shown to player
 *   starterCode:    string,   // partial code with TODOs
 *   expectedOutput: string,   // exact stdout the solution must produce
 * }
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

// Map login topic labels → domain slugs + language hints
const TOPIC_MAP = {
  'Arrays':               { domain: 'dsa',      language: 'python'     },
  'Strings':              { domain: 'dsa',      language: 'python'     },
  'Recursion':            { domain: 'dsa',      language: 'python'     },
  'Trees':                { domain: 'dsa',      language: 'python'     },
  'Dynamic Programming':  { domain: 'dsa',      language: 'python'     },
  'Graphs':               { domain: 'dsa',      language: 'python'     },
  'Sorting':              { domain: 'dsa',      language: 'python'     },
  'TypeScript':           { domain: 'frontend', language: 'javascript' },
};

const DEFAULT_TOPIC = { domain: 'dsa', language: 'python' };

/**
 * Build prompt asking Groq for one task.
 */
function buildTaskPrompt(topic, language) {
  return `Generate a short beginner-to-intermediate coding task about "${topic}" in ${language}.

REQUIREMENTS:
- The task MUST be solvable by printing a single hardcoded output line (no user input).
- The starter code must contain a function or class with TODO comments. The last line must print the result.
- The expected output must be a single line of text — the exact stdout when the solution is complete.
- Keep the task simple enough to solve in 2-5 minutes.

Respond with ONLY valid JSON (no markdown, no explanation) in exactly this shape:
{
  "prompt": "One sentence describing what the player must implement.",
  "starterCode": "# complete starter code with TODO placeholders\\nprint(solution())",
  "expectedOutput": "exact single line output"
}`;
}

/**
 * Call Groq to generate one task for a specific topic + language.
 *
 * @param {string} topic     - e.g. "Arrays"
 * @param {string} language  - "python" | "javascript"
 * @param {string} taskId    - unique id to assign
 * @returns {Promise<object>} task object
 */
async function generateTask(topic, language, taskId) {
  const meta = TOPIC_MAP[topic] || DEFAULT_TOPIC;
  const lang = language || meta.language;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return fallbackTask(topic, lang, taskId, meta.domain);

  try {
    const response = await fetch(GROQ_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:      GROQ_MODEL,
        messages: [
          {
            role:    'system',
            content: 'You are a coding challenge designer. Output only valid JSON as instructed.',
          },
          {
            role:    'user',
            content: buildTaskPrompt(topic, lang),
          },
        ],
        max_tokens:  600,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Groq ${response.status}: ${text.slice(0, 200)}`);
    }

    const data    = await response.json();
    const raw     = data.choices?.[0]?.message?.content ?? '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    return {
      id:             taskId,
      domain:         meta.domain,
      language:       lang,
      prompt:         parsed.prompt,
      starterCode:    parsed.starterCode,
      expectedOutput: parsed.expectedOutput,
    };
  } catch (err) {
    console.error(`[taskGenerator] generateTask error (${topic}):`, err.message);
    return fallbackTask(topic, lang, taskId, meta.domain);
  }
}

/**
 * Generate TASKS_PER_PLAYER tasks for a player based on their chosen topics.
 *
 * @param {string[]} topics          - topics picked on Login page
 * @param {string}   socketId        - used for unique task IDs
 * @param {number}   count           - how many tasks to generate
 * @returns {Promise<object[]>}
 */
async function generateTasksForPlayer(topics, socketId, count = 2) {
  // Pick `count` topics (cycle if fewer selected than needed)
  const pool = topics && topics.length > 0 ? topics : ['Arrays', 'Strings'];
  const chosen = [];
  for (let i = 0; i < count; i++) {
    chosen.push(pool[i % pool.length]);
  }

  // Generate in parallel for speed
  const tasks = await Promise.all(
    chosen.map((topic, idx) => {
      const meta   = TOPIC_MAP[topic] || DEFAULT_TOPIC;
      const taskId = `generated_${socketId.slice(-6)}_${idx}`;
      return generateTask(topic, meta.language, taskId);
    })
  );

  return tasks;
}

/**
 * Static fallback task if Groq is unavailable.
 */
function fallbackTask(topic, language, taskId, domain) {
  const isPython = language === 'python';
  return {
    id:          taskId,
    domain,
    language,
    prompt:      `Write a function related to ${topic} that returns the number 42.`,
    starterCode: isPython
      ? `def solve():\n    # TODO: return 42\n    pass\n\nprint(solve())`
      : `function solve() {\n  // TODO: return 42\n}\n\nconsole.log(solve());`,
    expectedOutput: '42',
  };
}

module.exports = { generateTasksForPlayer };
