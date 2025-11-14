// src/llm/json-parser.ts
/**
 * Parser JSON avec retry pour les réponses de l'agent
 * Gestion des erreurs Zod avec feedback pour l'IA
 */

import { parseAgentResponse, validateStopRule, type AgentResponse } from "./response-schema.js";
import logger from "../utils/logger.js";

export interface ParseResult {
  success: boolean;
  data?: AgentResponse;
  error?: string;
  retryCount?: number;
}

/**
 * Extrait le JSON d'une réponse qui pourrait contenir du markdown
 */
function extractJSON(text: string): string {
  // Remove markdown code blocks
  let cleaned = text.trim();

  // Check for ```json ... ``` or ``` ... ```
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  }

  // Try to find JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return cleaned;
}

/**
 * Parse une réponse JSON de l'agent avec validation Zod
 */
export function parseJSONResponse(responseText: string): ParseResult {
  try {
    // Extract JSON from potential markdown
    const jsonText = extractJSON(responseText);

    // Parse and validate with Zod
    const data = parseAgentResponse(jsonText);

    // Validate stop rule
    validateStopRule(data);

    logger.info("JSON response parsed successfully", {
      mode: data.mode,
      actionsCount: data.actions.length,
      tools: data.actions.map(a => a.tool),
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    const errorMessage = (error as Error).message;

    logger.error("Failed to parse JSON response", {
      error: errorMessage,
      responsePreview: responseText.substring(0, 200),
      fullResponseText: responseText, // ← LOG COMPLET pour debug!
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Génère un message d'erreur formaté pour l'IA
 */
export function formatErrorForRetry(error: string, attempt: number, maxAttempts: number): string {
  return `⚠️ JSON Parsing Error (Attempt ${attempt}/${maxAttempts}):

There was an error in your JSON response:
${error}

Please fix the error and respond with valid JSON following this exact format:
{
  "mode": "parallel" | "sequential",
  "actions": [
    { "tool": "tool_name", "args": { "param": "value" } }
  ]
}

Remember:
- NO markdown code blocks (no \`\`\`json)
- Return ONLY the JSON object
- mode must be "parallel" or "sequential"
- actions must be an array with at least one action
- Each action needs "tool" and "args" properties
- stop tool: ONLY in sequential mode, ALONE

Try again:`;
}
