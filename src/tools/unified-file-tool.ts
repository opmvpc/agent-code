// src/tools/unified-file-tool.ts
/**
 * Tool unifié pour la gestion CRUD des fichiers
 */

import { BaseTool, type ToolResult } from "./base-tool.js";
import type { Agent } from "../core/agent.js";

export class FileTool extends BaseTool {
  readonly name = "file";
  readonly description =
    "Manage files with CRUD operations. Supports read, write, list, and delete actions.";

  protected getParametersSchema() {
    return {
      properties: {
        action: {
          type: "string",
          enum: ["read", "write", "list", "delete"],
          description:
            "Action to perform: 'read' (read file), 'write' (create/update file), 'list' (list all files), 'delete' (remove file)",
        },
        filename: {
          type: "string",
          description:
            "Filename (required for read, write, delete actions). Must include extension (.js, .ts, .json, .txt, .html, .css, .md)",
        },
        content: {
          type: "string",
          description: "File content (required for 'write' action)",
        },
      },
      required: ["action"],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    // Validate action parameter
    if (!args.action) {
      return {
        success: false,
        error: "action parameter is required",
      };
    }

    const { action, filename, content } = args;

    switch (action) {
      case "read":
        return this.handleRead(filename, agent);

      case "write":
        return this.handleWrite(filename, content, agent);

      case "list":
        return this.handleList(agent);

      case "delete":
        return this.handleDelete(filename, agent);

      default:
        return {
          success: false,
          error: `Unknown action: ${action}. Use 'read', 'write', 'list', or 'delete'.`,
        };
    }
  }

  /**
   * Handle reading a file
   */
  private handleRead(filename: string, agent: Agent): ToolResult {
    if (!filename) {
      return {
        success: false,
        error: "filename parameter is required for 'read' action",
      };
    }

    try {
      const content = agent.getVFS().readFile(filename);
      const lines = content.split("\n").length;
      const size = new Blob([content]).size;

      return {
        success: true,
        action: "read",
        filename,
        content,
        size,
        lines,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle writing/creating a file
   */
  private handleWrite(
    filename: string,
    content: string,
    agent: Agent
  ): ToolResult {
    if (!filename) {
      return {
        success: false,
        error: "filename parameter is required for 'write' action",
      };
    }

    if (content === undefined || content === null) {
      return {
        success: false,
        error: "content parameter is required for 'write' action",
      };
    }

    try {
      agent.getVFS().writeFile(filename, content);
      agent.getMemory().addFileCreated(filename);

      const lines = content.split("\n").length;
      const size = new Blob([content]).size;

      return {
        success: true,
        action: "write",
        filename,
        size,
        lines,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle listing all files
   */
  private handleList(agent: Agent): ToolResult {
    try {
      const files = agent.getVFS().listFiles();

      return {
        success: true,
        action: "list",
        files: files.map((f) => ({
          path: f.path,
          size: f.size,
          extension: f.path.split(".").pop(),
        })),
        count: files.length,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle deleting a file
   */
  private handleDelete(filename: string, agent: Agent): ToolResult {
    if (!filename) {
      return {
        success: false,
        error: "filename parameter is required for 'delete' action",
      };
    }

    try {
      agent.getVFS().deleteFile(filename);

      return {
        success: true,
        action: "delete",
        filename,
        message: `File '${filename}' deleted`,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}
