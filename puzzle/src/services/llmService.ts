import axios from "axios";
import type { PuzzleData } from "../types/puzzle.js";
import { getDomainTemplate } from "../prompts/domainPrompts.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Generates a coding puzzle for the given domain using Claude or OpenAI.
 * Falls back to a hard-coded example puzzle if the LLM call fails.
 */
export async function generatePuzzle(domain: string): Promise<PuzzleData> {
  const template = getDomainTemplate(domain);

  // Try Claude first, then OpenAI, then fall back to example puzzle
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await generateWithClaude(template.systemPrompt, template.userPrompt, template.languageId);
    } catch (err) {
      console.warn("Claude generation failed, trying OpenAI:", (err as Error).message);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateWithOpenAI(template.systemPrompt, template.userPrompt, template.languageId);
    } catch (err) {
      console.warn("OpenAI generation failed, using fallback puzzle:", (err as Error).message);
    }
  }

  console.info("No LLM API key configured or all attempts failed. Using fallback puzzle.");
  return template.fallbackPuzzle;
}

async function generateWithClaude(
  systemPrompt: string,
  userPrompt: string,
  languageId: number
): Promise<PuzzleData> {
  const response = await axios.post(
    ANTHROPIC_API_URL,
    {
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    },
    {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  const text: string = response.data.content[0].text;
  return parseLlmResponse(text, languageId);
}

async function generateWithOpenAI(
  systemPrompt: string,
  userPrompt: string,
  languageId: number
): Promise<PuzzleData> {
  const response = await axios.post(
    OPENAI_API_URL,
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  const text: string = response.data.choices[0].message.content;
  return parseLlmResponse(text, languageId);
}

function parseLlmResponse(text: string, languageId: number): PuzzleData {
  // Extract JSON block from response (LLMs sometimes wrap it in markdown)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("LLM response did not contain valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    prompt?: string;
    starterCode?: string;
    testInput?: string;
    expectedOutput?: string;
  };

  if (!parsed.prompt || !parsed.starterCode || parsed.expectedOutput === undefined) {
    throw new Error("LLM response JSON is missing required fields");
  }

  return {
    prompt: parsed.prompt,
    starterCode: parsed.starterCode,
    testInput: parsed.testInput ?? "",
    expectedOutput: parsed.expectedOutput,
    languageId,
  };
}
