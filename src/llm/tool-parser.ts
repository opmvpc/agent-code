// src/llm/tool-parser.ts
/**
 * Parser pour les tool calls natifs d'OpenRouter
 * Enfin un vrai parser qui parse de vrais trucs! 🎉
 */

import chalk from "chalk";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolCallMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export class ToolParser {
  /**
   * Parse les tool calls depuis la réponse du LLM
   */
  parseToolCalls(message: ToolCallMessage): ParsedToolCall[] {
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return [];
    }

    const parsed: ParsedToolCall[] = [];

    for (const toolCall of message.tool_calls) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        parsed.push({
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: args,
        });
      } catch (error) {
        console.error(
          chalk.red(`Failed to parse tool call arguments: ${toolCall.function.arguments}`)
        );
        // Continue with other tool calls
      }
    }

    return parsed;
  }

  /**
   * Format tool call pour l'affichage
   */
  formatToolCall(toolCall: ParsedToolCall): string {
    const icons: Record<string, string> = {
      write_file: "📝",
      read_file: "📖",
      execute_code: "▶️",
      list_files: "📋",
      delete_file: "🗑️",
      create_project: "📦",
      switch_project: "🔄",
      list_projects: "📋",
    };

    const icon = icons[toolCall.name] || "🔧";
    
    let description = `${icon} ${toolCall.name}`;
    
    // Add relevant parameters for display
    if (toolCall.arguments.filename) {
      description += `: ${toolCall.arguments.filename}`;
    } else if (toolCall.arguments.project_name) {
      description += `: ${toolCall.arguments.project_name}`;
    }

    return chalk.cyan(description);
  }

  /**
   * Valide les arguments d'un tool call
   */
  validateToolCall(toolCall: ParsedToolCall): { valid: boolean; error?: string } {
    // Validate based on tool name
    switch (toolCall.name) {
      case "write_file":
        if (!toolCall.arguments.filename || !toolCall.arguments.content) {
          return {
            valid: false,
            error: "write_file requires filename and content",
          };
        }
        break;

      case "read_file":
      case "execute_code":
      case "delete_file":
        if (!toolCall.arguments.filename) {
          return {
            valid: false,
            error: `${toolCall.name} requires filename`,
          };
        }
        break;

      case "create_project":
      case "switch_project":
        if (!toolCall.arguments.project_name) {
          return {
            valid: false,
            error: `${toolCall.name} requires project_name`,
          };
        }
        break;

      case "list_files":
      case "list_projects":
        // No validation needed
        break;

      default:
        return {
          valid: false,
          error: `Unknown tool: ${toolCall.name}`,
        };
    }

    return { valid: true };
  }
}

