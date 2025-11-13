// src/tools/file-tools.ts
/**
 * Tools pour la gestion des fichiers
 */

import { BaseTool, type ToolResult } from "./base-tool.js";
import type { Agent } from "../core/agent.js";

/**
 * Tool pour écrire/créer un fichier
 */
export class WriteFileTool extends BaseTool {
  readonly name = "write_file";
  readonly description = "Create or update a file with content. Supports .js, .ts, .json, .html, .css, .md, .txt";

  protected getParametersSchema() {
    return {
      properties: {
        filename: {
          type: "string",
          description: "Path/name of the file (e.g., 'app.js', 'styles.css')",
        },
        content: {
          type: "string",
          description: "Complete content to write to the file",
        },
      },
      required: ["filename", "content"],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    this.validateArgs(args, ["filename", "content"]);

    const { filename, content } = args;

    try {
      agent.getVFS().writeFile(filename, content);
      agent.getMemory().addFileCreated(filename);

      return {
        success: true,
        filename,
        size: content.length,
        message: `File ${filename} written successfully (${content.length} bytes)`,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

/**
 * Tool pour lire un fichier
 */
export class ReadFileTool extends BaseTool {
  readonly name = "read_file";
  readonly description = "Read the content of an existing file";

  protected getParametersSchema() {
    return {
      properties: {
        filename: {
          type: "string",
          description: "Path/name of the file to read",
        },
      },
      required: ["filename"],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    this.validateArgs(args, ["filename"]);

    const { filename } = args;

    try {
      const content = agent.getVFS().readFile(filename);

      return {
        success: true,
        filename,
        content,
        size: content.length,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

/**
 * Tool pour lister les fichiers
 */
export class ListFilesTool extends BaseTool {
  readonly name = "list_files";
  readonly description = "List all files in the virtual filesystem";

  protected getParametersSchema() {
    return {
      properties: {},
      required: [],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    const files = agent.getVFS().listFiles();
    const fileList = files
      .filter((f) => !f.isDirectory)
      .map((f) => ({ path: f.path, size: f.size }));

    return {
      success: true,
      files: fileList,
      count: fileList.length,
    };
  }
}

/**
 * Tool pour supprimer un fichier
 */
export class DeleteFileTool extends BaseTool {
  readonly name = "delete_file";
  readonly description = "Delete a file from the filesystem";

  protected getParametersSchema() {
    return {
      properties: {
        filename: {
          type: "string",
          description: "Path/name of the file to delete",
        },
      },
      required: ["filename"],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    this.validateArgs(args, ["filename"]);

    const { filename } = args;

    try {
      agent.getVFS().deleteFile(filename);

      return {
        success: true,
        filename,
        message: `File ${filename} deleted successfully`,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}
