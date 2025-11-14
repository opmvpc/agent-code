// src/llm/response-schema.ts
/**
 * Schéma Zod pour valider les réponses JSON de l'agent
 * On revient aux sources avec un système custom! 🎯
 */

import { z } from "zod";

/**
 * Schema pour un tool call individuel
 */
export const ToolCallSchema = z.object({
  tool: z.string().describe("Name of the tool to call"),
  args: z.record(z.any()).describe("Arguments for the tool"),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

/**
 * Schema pour la réponse complète de l'agent
 */
export const AgentResponseSchema = z.object({
  mode: z.enum(["parallel", "sequential"]).describe(
    "Execution mode: 'parallel' for independent actions, 'sequential' for dependent steps"
  ),
  actions: z.array(ToolCallSchema).min(1).describe(
    "List of tool calls to execute. Must contain at least one action."
  ),
  reasoning: z.string().optional().describe(
    "Optional: Your reasoning for these actions (only if reasoning is enabled)"
  ),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

/**
 * Parse et valide une réponse JSON de l'agent
 */
export function parseAgentResponse(jsonString: string): AgentResponse {
  try {
    const parsed = JSON.parse(jsonString);
    return AgentResponseSchema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new Error(`Invalid agent response format: ${issues}`);
    }
    throw new Error(`Failed to parse agent response: ${(error as Error).message}`);
  }
}

/**
 * Valide qu'un tool call "stop" respecte les règles
 */
export function validateStopRule(response: AgentResponse): void {
  const hasStop = response.actions.some(action => action.tool === "stop");

  if (hasStop) {
    // Stop doit être en mode sequential
    if (response.mode !== "sequential") {
      throw new Error("'stop' tool can only be used in sequential mode");
    }

    // Stop doit être seul OU en dernier de la liste
    const stopIndex = response.actions.findIndex(action => action.tool === "stop");
    const isLast = stopIndex === response.actions.length - 1;
    const isAlone = response.actions.length === 1;

    if (!isAlone && !isLast) {
      throw new Error("'stop' tool must be either alone or last in the sequential actions list");
    }
  }
}
