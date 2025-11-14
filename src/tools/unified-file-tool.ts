// src/tools/unified-file-tool.ts
/**
 * Tool unifié pour la gestion CRUD des fichiers
 */

import { BaseTool, type ToolResult } from "./base-tool.js";
import chalk from "chalk";
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
            "Filename (required for read, write, edit, delete actions). Must include extension (.js, .ts, .json, .txt, .html, .css, .md, .svg)",
        },
        instructions: {
          type: "string",
          description:
            "HIGH-LEVEL instructions for AI to generate (write) or modify (edit) the file content. NEVER put actual code here! Examples: 'Create a responsive navigation menu with dropdown', 'Draw a beautiful house with a red roof and chimney', 'Add error handling to the main function'. The AI will generate the actual code based on these instructions. Required for write and edit actions.",
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

      // Call LLM to generate code with a FRESH client (no agentic loop system prompt!)
      const llmClient = agent.getLLMClient();

      // Create a dedicated code generation system prompt
      const codeGenSystemPrompt = `You are a code generator. Your ONLY job is to output raw code.

CRITICAL RULES:
- Output ONLY the code itself (HTML, CSS, JS, SVG, etc.)
- NO JSON responses
- NO markdown code blocks
- NO explanations or comments outside the code
- NO tool calls
- Just pure, raw, working code

Example request: "Create a button"
Bad response: {"mode": "parallel", "actions": [...]}
Good response: <button class="btn">Click me</button>`;

      const response = await llmClient.chat([
        {
          role: "system",
          content: codeGenSystemPrompt,
        },
        {
          role: "user",
          content: codeGenPrompt,
        },
      ]);

      let generatedCode = response.choices?.[0]?.message?.content || "";

      if (process.env.DEBUG === "true") {
        console.log(
          chalk.gray(
            `\n[FileTool] Raw AI response (first 200 chars): ${generatedCode.substring(
              0,
              200
            )}`
          )
        );
      }

      // Safety: If LLM still returned JSON (because of persistent system prompt), extract content
      if (generatedCode.trim().startsWith("{")) {
        try {
          const jsonResponse = JSON.parse(generatedCode);
          // Try to extract actual code from various JSON structures
          if (jsonResponse.actions && Array.isArray(jsonResponse.actions)) {
            const fileAction = jsonResponse.actions.find(
              (a: any) => a.tool === "file"
            );
            if (fileAction?.args?.instructions) {
              generatedCode = fileAction.args.instructions;
              if (process.env.DEBUG === "true") {
                console.log(
                  chalk.yellow(`[FileTool] Extracted code from JSON response`)
                );
              }
            }
          }
        } catch {
          // Not JSON, continue with original content
        }
      }

      if (!generatedCode || generatedCode.trim().length === 0) {
        return {
          success: false,
          error: "AI failed to generate code (empty response)",
        };
      }

      // Clean up potential markdown code blocks
      let cleanCode = generatedCode.trim();
      const codeBlockMatch = cleanCode.match(/```(?:\w+)?\s*\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        cleanCode = codeBlockMatch[1];
        if (process.env.DEBUG === "true") {
          console.log(chalk.gray(`[FileTool] Cleaned markdown code blocks`));
        }
      }

      // CRITICAL: Validate that we have actual CODE, not instructions!
      // Instructions are typically plain English sentences, code has symbols
      const hasCodeSymbols = /[<>{}\[\];()=]/.test(cleanCode);
      const looksLikeInstructions =
        cleanCode.length < 200 &&
        !hasCodeSymbols &&
        /^[A-Z].*[a-z]{10,}/.test(cleanCode);

      if (looksLikeInstructions) {
        if (process.env.DEBUG === "true") {
          console.log(
            chalk.red(
              `[FileTool] WARNING: Generated content looks like instructions, not code!`
            )
          );
          console.log(chalk.red(`[FileTool] Content: ${cleanCode}`));
        }
        return {
          success: false,
          error: `AI generated instructions instead of code. Content: "${cleanCode.substring(
            0,
            100
          )}"`,
        };
      }

      if (process.env.DEBUG === "true") {
        console.log(
          chalk.gray(
            `[FileTool] Writing ${cleanCode.length} bytes to ${filename}`
          )
        );
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
