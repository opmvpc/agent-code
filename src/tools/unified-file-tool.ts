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
          enum: ["read", "write", "edit", "list", "delete"],
          description:
            "Action to perform: 'read' (read file), 'write' (generate new file with AI), 'edit' (modify existing file with AI), 'list' (list all files), 'delete' (remove file)",
        },
        filename: {
          type: "string",
          description:
            "Filename (required for read, write, edit, delete actions). Must include extension (.js, .ts, .json, .txt, .html, .css, .md)",
        },
        instructions: {
          type: "string",
          description:
            "Instructions for AI to generate (write) or modify (edit) the file content. Required for write and edit actions.",
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

    const { action, filename, instructions } = args;

    switch (action) {
      case "read":
        return this.handleRead(filename, agent);

      case "write":
        return await this.handleAIWrite(filename, instructions, agent);

      case "edit":
        return await this.handleAIEdit(filename, instructions, agent);

      case "list":
        return this.handleList(agent);

      case "delete":
        return this.handleDelete(filename, agent);

      default:
        return {
          success: false,
          error: `Unknown action: ${action}. Use 'read', 'write', 'edit', 'list', or 'delete'.`,
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

  // handleWrite method removed - all writes now use AI generation via handleAIWrite

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

  /**
   * Handle AI-generated file creation
   */
  private async handleAIWrite(
    filename: string,
    instructions: string,
    agent: Agent
  ): Promise<ToolResult> {
    if (!filename) {
      return {
        success: false,
        error: "filename parameter is required for 'write' action",
      };
    }

    if (!instructions) {
      return {
        success: false,
        error:
          "instructions parameter is required for AI-generated 'write' action",
      };
    }

    try {
      console.log("\n💡 Generating code with AI...");

      // Get conversation history for context
      const conversationContext = agent
        .getMemory()
        .getMessages()
        .slice(-5) // Last 5 messages for context
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      // Build prompt for code generation
      const codeGenPrompt = `You are a code generation assistant. Generate ONLY the code, no explanations, no markdown.

File: ${filename}
Instructions: ${instructions}

Recent conversation context:
${conversationContext}

Generate the complete, working code for this file:`;

      // Call LLM to generate code
      const llmClient = agent.getLLMClient();
      const response = await llmClient.chat([
        {
          role: "system",
          content:
            "You are a code generator. Output ONLY code, no markdown, no explanations.",
        },
        {
          role: "user",
          content: codeGenPrompt,
        },
      ]);

      const generatedCode = response.choices?.[0]?.message?.content || "";

      if (!generatedCode) {
        return {
          success: false,
          error: "AI failed to generate code",
        };
      }

      // Clean up potential markdown code blocks
      let cleanCode = generatedCode.trim();
      const codeBlockMatch = cleanCode.match(/```(?:\w+)?\s*\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        cleanCode = codeBlockMatch[1];
      }

      // Write the generated code
      agent.getVFS().writeFile(filename, cleanCode);
      agent.getMemory().addFileCreated(filename);

      const lines = cleanCode.split("\n").length;
      const size = new Blob([cleanCode]).size;

      console.log(`✓ Code generated (${lines} lines)`);

      return {
        success: true,
        action: "write",
        filename,
        size,
        lines,
        generated: true,
        preview: cleanCode.substring(0, 200) + "...",
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle AI-powered file editing
   */
  private async handleAIEdit(
    filename: string,
    instructions: string,
    agent: Agent
  ): Promise<ToolResult> {
    if (!filename) {
      return {
        success: false,
        error: "filename parameter is required for 'edit' action",
      };
    }

    if (!instructions) {
      return {
        success: false,
        error: "instructions parameter is required for 'edit' action",
      };
    }

    try {
      // Read current file content
      const currentContent = agent.getVFS().readFile(filename);

      console.log("\n✏️  Editing code with AI...");

      // Get conversation history for context
      const conversationContext = agent
        .getMemory()
        .getMessages()
        .slice(-5)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      // Build prompt for code editing
      const codeEditPrompt = `You are a code editing assistant. Modify the existing code according to instructions.
Output ONLY the complete modified code, no explanations, no markdown.

File: ${filename}
Instructions: ${instructions}

Current code:
\`\`\`
${currentContent}
\`\`\`

Recent conversation context:
${conversationContext}

Generate the COMPLETE modified code:`;

      // Call LLM to edit code
      const llmClient = agent.getLLMClient();
      const response = await llmClient.chat([
        {
          role: "system",
          content:
            "You are a code editor. Output ONLY the complete modified code, no markdown, no explanations.",
        },
        {
          role: "user",
          content: codeEditPrompt,
        },
      ]);

      const modifiedCode = response.choices?.[0]?.message?.content || "";

      if (!modifiedCode) {
        return {
          success: false,
          error: "AI failed to edit code",
        };
      }

      // Clean up potential markdown code blocks
      let cleanCode = modifiedCode.trim();
      const codeBlockMatch = cleanCode.match(/```(?:\w+)?\s*\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        cleanCode = codeBlockMatch[1];
      }

      // Write the modified code
      agent.getVFS().writeFile(filename, cleanCode);

      const lines = cleanCode.split("\n").length;
      const size = new Blob([cleanCode]).size;

      console.log(`✓ Code edited (${lines} lines)`);

      return {
        success: true,
        action: "edit",
        filename,
        size,
        lines,
        modified: true,
        preview: cleanCode.substring(0, 200) + "...",
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}
