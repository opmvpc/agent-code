// src/llm/parser.ts
/**
 * Parser pour les réponses du LLM
 * Parce que le LLM répond n'importe comment parfois 🤪
 */

import { z } from "zod";
import chalk from "chalk";

// Zod schemas pour valider les réponses
const ActionSchema = z.object({
  type: z.enum([
    "write_file",
    "read_file",
    "execute_code",
    "list_files",
    "delete_file",
    "create_project",
    "switch_project",
    "list_projects",
  ]),
  filename: z.string().optional(),
  content: z.string().optional(),
  projectName: z.string().optional(),
});

const AgentResponseSchema = z.object({
  thought: z.string().optional(),
  actions: z.array(ActionSchema).optional(),
  message: z.string(),
});

export type Action = z.infer<typeof ActionSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export class ResponseParser {
  /**
   * Parse la réponse du LLM
   */
  parse(rawResponse: string): AgentResponse {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : rawResponse;

    try {
      const parsed = JSON.parse(jsonStr);
      const validated = AgentResponseSchema.parse(parsed);
      return validated;
    } catch (error) {
      // If parsing fails, treat the whole response as a message
      console.warn(
        chalk.yellow(
          "⚠️  Failed to parse JSON response, treating as plain message"
        )
      );

      // Try to be smart and detect actions from plain text
      const actions = this.extractActionsFromText(rawResponse);

      return {
        message: rawResponse,
        actions: actions.length > 0 ? actions : undefined,
      };
    }
  }

  /**
   * Extrait des actions depuis du texte plain
   * (pour quand le LLM fait pas ce qu'on lui demande 🙄)
   */
  private extractActionsFromText(text: string): Action[] {
    const actions: Action[] = [];

    // Detect code blocks
    const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)```/g;
    let match;
    let fileIndex = 1;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const language = match[1] || "js";
      const content = match[2].trim();

      if (content) {
        // Check if there's a filename comment
        const filenameMatch = content.match(
          /^\/\/\s*(.+?\.(?:js|ts|json|txt))/
        );
        const filename = filenameMatch
          ? filenameMatch[1]
          : `generated_${fileIndex++}.${
              language === "typescript" ? "ts" : "js"
            }`;

        actions.push({
          type: "write_file",
          filename,
          content,
        });
      }
    }

    return actions;
  }

  /**
   * Valide une action
   */
  validateAction(action: Action): { valid: boolean; error?: string } {
    // Check required fields based on action type
    switch (action.type) {
      case "write_file":
        if (!action.filename || !action.content) {
          return {
            valid: false,
            error: "write_file requires filename and content",
          };
        }
        break;

      case "read_file":
      case "execute_code":
      case "delete_file":
        if (!action.filename) {
          return {
            valid: false,
            error: `${action.type} requires filename`,
          };
        }
        break;

      case "list_files":
      case "list_projects":
        // No requirements
        break;

      case "create_project":
      case "switch_project":
        if (!action.projectName) {
          return {
            valid: false,
            error: `${action.type} requires projectName`,
          };
        }
        break;
    }

    // Validate filename format
    if (action.filename) {
      const validExtensions = [
        ".js",
        ".ts",
        ".json",
        ".txt",
        ".md",
        ".html",
        ".css",
      ];
      const hasValidExt = validExtensions.some((ext) =>
        action.filename!.toLowerCase().endsWith(ext)
      );

      if (!hasValidExt) {
        return {
          valid: false,
          error: `Invalid file extension. Allowed: ${validExtensions.join(
            ", "
          )}`,
        };
      }

      // Check for path traversal
      if (action.filename.includes("..")) {
        return {
          valid: false,
          error: "Path traversal not allowed (nice try tho 🚫)",
        };
      }
    }

    return { valid: true };
  }

  /**
   * Pretty print d'une action
   */
  formatAction(action: Action): string {
    switch (action.type) {
      case "write_file":
        return chalk.blue(`📝 Writing file: ${action.filename}`);
      case "read_file":
        return chalk.cyan(`📖 Reading file: ${action.filename}`);
      case "execute_code":
        return chalk.green(`▶️  Executing: ${action.filename}`);
      case "list_files":
        return chalk.gray("📋 Listing files");
      case "delete_file":
        return chalk.red(`🗑️  Deleting: ${action.filename}`);
      case "create_project":
        return chalk.magenta(`📦 Creating project: ${action.projectName}`);
      case "switch_project":
        return chalk.yellow(`🔄 Switching to project: ${action.projectName}`);
      case "list_projects":
        return chalk.gray("📋 Listing projects");
    }
  }
}
