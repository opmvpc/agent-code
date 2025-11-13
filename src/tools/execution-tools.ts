// src/tools/execution-tools.ts
/**
 * Tools pour l'exécution de code
 */

import { BaseTool, type ToolResult } from "./base-tool.js";
import type { Agent } from "../core/agent.js";

/**
 * Tool pour exécuter du code JavaScript/TypeScript
 */
export class ExecuteCodeTool extends BaseTool {
  readonly name = "execute_code";
  readonly description = "Execute JavaScript or TypeScript code from a file in the sandbox (5 second timeout, no external imports)";

  protected getParametersSchema() {
    return {
      properties: {
        filename: {
          type: "string",
          description: "Path to the .js or .ts file to execute",
        },
      },
      required: ["filename"],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    this.validateArgs(args, ["filename"]);

    const { filename } = args;

    try {
      // Read file content
      const code = agent.getVFS().readFile(filename);

      // Execute in sandbox
      const result = await agent.getExecutor().execute(code, filename);

      // Result is returned directly (no need to store in memory)

      return {
        success: !result.error,
        filename,
        output: result.output,
        error: result.error,
        executionTime: result.executionTime,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}
