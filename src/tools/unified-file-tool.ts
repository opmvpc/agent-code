// src/tools/unified-file-tool.ts
/**
 * Tool unifié pour la gestion CRUD des fichiers
 * AVEC génération de code validée par Zod + retry!
 */

import { BaseTool, type ToolResult } from "./base-tool.js";
import chalk from "chalk";
import type { Agent } from "../core/agent.js";
import {
  parseCodeGeneration,
  type CodeGeneration,
} from "../llm/code-generation-schema.js";
import {
  getCodeGenerationPrompt,
  getCodeEditPrompt,
} from "../llm/code-generation-prompt.js";
import logger from "../utils/logger.js";

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

  /**
   * Handle listing all files
   */
  private handleList(agent: Agent): ToolResult {
    try {
      const files = agent.getVFS().listFiles();

      // Build tree structure récursive
      const tree = this.buildFileTree(files);
      const treeText = this.formatFileTree(tree);

      return {
        success: true,
        action: "list",
        files: files.map((f) => ({
          path: f.path,
          size: f.size,
          extension: f.path.split(".").pop(),
        })),
        count: files.length,
        tree: treeText, // Structure arborescente lisible!
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Build hierarchical tree structure from flat file list
   */
  private buildFileTree(files: any[]): any {
    const root: any = { name: ".", type: "directory", children: {} };

    for (const file of files) {
      if (file.isDirectory) continue; // Skip directories, only show files

      const parts = file.path.split("/");
      let current = root;

      // Create directory structure
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            type: "directory",
            children: {},
          };
        }
        current = current.children[part];
      }

      // Add file at the end
      const fileName = parts[parts.length - 1];
      current.children[fileName] = {
        name: fileName,
        type: "file",
        size: file.size,
      };
    }

    return root;
  }

  /**
   * Format tree structure as ASCII art (style ls -R ou tree)
   */
  private formatFileTree(
    node: any,
    prefix: string = "",
    isLast: boolean = true
  ): string {
    let result = "";

    if (node.name !== ".") {
      const connector = isLast ? "└── " : "├── ";
      const fileInfo =
        node.type === "file" ? ` (${this.formatSize(node.size)})` : "/";
      result += prefix + connector + node.name + fileInfo + "\n";
    }

    // Sort children: directories first, then files
    const children = Object.values(node.children || {});
    const dirs = children.filter((c: any) => c.type === "directory");
    const filesOnly = children.filter((c: any) => c.type === "file");
    const sortedChildren = [
      ...dirs.sort((a: any, b: any) => a.name.localeCompare(b.name)),
      ...filesOnly.sort((a: any, b: any) => a.name.localeCompare(b.name)),
    ];

    sortedChildren.forEach((child: any, index: number) => {
      const isLastChild = index === sortedChildren.length - 1;
      const extension = node.name === "." ? "" : isLast ? "    " : "│   ";
      result += this.formatFileTree(
        child,
        prefix + extension,
        isLastChild
      );
    });

    return result;
  }

  /**
   * Format file size human-readable (B, KB, MB)
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
   * Handle AI-generated file creation (with Zod validation + retry!)
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
      logger.info("[FileTool] Starting AI code generation", {
        action: "write",
        filename,
        instructionsLength: instructions.length,
      });

      // Get conversation history for context
      const conversationContext = agent
        .getMemory()
        .getMessages()
        .slice(-5) // Last 5 messages for context
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      // Build prompt for code generation using the NEW dedicated prompt!
      const userPrompt = getCodeGenerationPrompt(
        filename,
        instructions,
        conversationContext
      );

      logger.debug("[FileTool] Generated prompt for code generation", {
        filename,
        promptLength: userPrompt.length,
        fullPrompt: userPrompt, // Log complet du prompt
      });

      // Call LLM with retry mechanism + structured outputs! 🎯
      const llmClient = agent.getLLMClient();
      const maxRetries = 5;
      let lastError = "";

      // Import schema dynamically
      const { getCodeGenerationJsonSchema } = await import("../llm/code-generation-schema.js");
      const responseFormat = getCodeGenerationJsonSchema();

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (attempt > 1) {
          console.log(
            chalk.yellow(`\n[FileTool] Retry ${attempt}/${maxRetries}...`)
          );
          logger.warn("[FileTool] Retrying code generation", {
            attempt,
            maxRetries,
            filename,
            lastError,
          });
        } else {
          logger.info("[FileTool] Sending request to LLM", {
            attempt: 1,
            filename,
            model: agent.getLLMClient().constructor.name,
          });
        }

        // Add Zod error feedback to the prompt on retry
        const retryPrompt =
          attempt > 1
            ? `${userPrompt}\n\n⚠️ PREVIOUS ATTEMPT FAILED:\n${lastError}\n\nPlease fix the error and respond with valid JSON.`
            : userPrompt;

        if (attempt > 1) {
          logger.debug("[FileTool] Retry prompt with error feedback", {
            filename,
            attempt,
            retryPromptLength: retryPrompt.length,
            fullRetryPrompt: retryPrompt,
          });
        }

        const response = await llmClient.chat([
          {
            role: "user",
            content: retryPrompt,
          },
        ], { responseFormat });

        const rawResponse = response.choices?.[0]?.message?.content || "";

        // Log la réponse brute de l'API (TOUJOURS, pas juste en DEBUG)
        logger.info("[FileTool] Received raw response from LLM", {
          filename,
          attempt,
          responseLength: rawResponse.length,
          responsePreview: rawResponse.substring(0, 500),
          fullResponse: rawResponse, // Réponse complète pour debug
          usage: response.usage,
        });

        if (process.env.DEBUG === "true") {
          console.log(
            chalk.gray(
              `\n[FileTool] Raw AI response (first 200 chars): ${rawResponse.substring(
                0,
                200
              )}`
            )
          );
        }

        // Parse with Zod validation
        logger.debug("[FileTool] Attempting to parse response with Zod", {
          filename,
          attempt,
          rawResponseLength: rawResponse.length,
        });

        const parseResult = parseCodeGeneration(rawResponse);

        if (parseResult.success) {
          // SUCCESS! Write the file
          const { filename: generatedFilename, content } = parseResult.data;

          logger.info("[FileTool] Successfully parsed code generation response", {
            filename: generatedFilename,
            attempt,
            contentLength: content.length,
            contentLines: content.split("\n").length,
          });

          logger.debug("[FileTool] Generated code content", {
            filename: generatedFilename,
            fullContent: content, // Log du code complet généré
            contentPreview: content.substring(0, 1000),
          });

          if (process.env.DEBUG === "true") {
            console.log(
              chalk.gray(
                `[FileTool] Writing ${content.length} bytes to ${generatedFilename}`
              )
            );
          }

          agent.getVFS().writeFile(generatedFilename, content);
          agent.getMemory().addFileCreated(generatedFilename);

          const lines = content.split("\n").length;
          const size = new Blob([content]).size;

          console.log(`✓ Code generated (${lines} lines)`);
          logger.info("[FileTool] File successfully written", {
            filename: generatedFilename,
            size,
            lines,
            totalAttempts: attempt,
          });

          return {
            success: true,
            action: "write",
            filename: generatedFilename,
            size,
            lines,
            generated: true,
            content, // Include full content for agent's memory!
            preview: content.substring(0, 200) + "...",
          };
        } else {
          // FAILED - prepare retry
          lastError = parseResult.zodErrors
            ? `Validation errors:\n${parseResult.zodErrors}`
            : parseResult.error;

          logger.error("[FileTool] Failed to parse code generation response", {
            filename,
            attempt,
            error: lastError,
            zodErrors: parseResult.zodErrors,
            rawError: parseResult.error,
            rawResponse: rawResponse.substring(0, 1000),
            fullRawResponse: rawResponse, // Log complet pour debug
          });

          if (process.env.DEBUG === "true") {
            console.log(chalk.red(`[FileTool] Parse error: ${lastError}`));
          }

          if (attempt === maxRetries) {
            // Final attempt failed
            return {
              success: false,
              error: `Failed to generate valid code after ${maxRetries} attempts. Last error: ${lastError}`,
            };
          }
        }
      }

      // Should never reach here
      return {
        success: false,
        error: "Code generation failed (unexpected end of retry loop)",
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to write file ${filename}: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Handle AI-powered file editing (TODO: apply same Zod + retry logic!)
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
      logger.info("[FileTool] Starting AI code editing", {
        action: "edit",
        filename,
        currentContentLength: currentContent.length,
        instructionsLength: instructions.length,
      });

      // Get conversation history for context
      const conversationContext = agent
        .getMemory()
        .getMessages()
        .slice(-5)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      // Build prompt for code editing using dedicated prompt
      const userPrompt = getCodeEditPrompt(
        filename,
        currentContent,
        instructions,
        conversationContext
      );

      logger.debug("[FileTool] Generated prompt for code editing", {
        filename,
        promptLength: userPrompt.length,
        currentContentLength: currentContent.length,
        fullPrompt: userPrompt, // Log complet du prompt
      });

      // Call LLM with retry + structured outputs! 🎯
      const llmClient = agent.getLLMClient();
      const maxRetries = 5;
      let lastError = "";

      // Import schema dynamically
      const { getCodeGenerationJsonSchema } = await import("../llm/code-generation-schema.js");
      const responseFormat = getCodeGenerationJsonSchema();

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (attempt > 1) {
          console.log(
            chalk.yellow(`\n[FileTool] Retry ${attempt}/${maxRetries}...`)
          );
          logger.warn("[FileTool] Retrying code editing", {
            attempt,
            maxRetries,
            filename,
            lastError,
          });
        } else {
          logger.info("[FileTool] Sending edit request to LLM", {
            attempt: 1,
            filename,
            model: agent.getLLMClient().constructor.name,
          });
        }

        const retryPrompt =
          attempt > 1
            ? `${userPrompt}\n\n⚠️ PREVIOUS ATTEMPT FAILED:\n${lastError}\n\nPlease fix the error and respond with valid JSON.`
            : userPrompt;

        if (attempt > 1) {
          logger.debug("[FileTool] Retry prompt with error feedback (edit)", {
            filename,
            attempt,
            retryPromptLength: retryPrompt.length,
            fullRetryPrompt: retryPrompt,
          });
        }

        const response = await llmClient.chat([
          {
            role: "user",
            content: retryPrompt,
          },
        ], { responseFormat });

        const rawResponse = response.choices?.[0]?.message?.content || "";

        // Log la réponse brute de l'API (TOUJOURS, pas juste en DEBUG)
        logger.info("[FileTool] Received raw response from LLM (edit)", {
          filename,
          attempt,
          responseLength: rawResponse.length,
          responsePreview: rawResponse.substring(0, 500),
          fullResponse: rawResponse, // Réponse complète pour debug
          usage: response.usage,
        });

        // Parse with Zod validation
        logger.debug("[FileTool] Attempting to parse edit response with Zod", {
          filename,
          attempt,
          rawResponseLength: rawResponse.length,
        });

        const parseResult = parseCodeGeneration(rawResponse);

        if (parseResult.success) {
          const { filename: editedFilename, content } = parseResult.data;

          logger.info("[FileTool] Successfully parsed code edit response", {
            filename: editedFilename,
            attempt,
            contentLength: content.length,
            contentLines: content.split("\n").length,
          });

          logger.debug("[FileTool] Edited code content", {
            filename: editedFilename,
            fullContent: content, // Log du code complet édité
            contentPreview: content.substring(0, 1000),
          });

          agent.getVFS().writeFile(editedFilename, content);

          const lines = content.split("\n").length;
          const size = new Blob([content]).size;

          console.log(`✓ Code edited (${lines} lines)`);
          logger.info("[FileTool] File successfully edited and written", {
            filename: editedFilename,
            size,
            lines,
            totalAttempts: attempt,
          });

          return {
            success: true,
            action: "edit",
            filename: editedFilename,
            size,
            lines,
            modified: true,
            content, // Include full content for agent's memory!
            preview: content.substring(0, 200) + "...",
          };
        } else {
          lastError = parseResult.zodErrors
            ? `Validation errors:\n${parseResult.zodErrors}`
            : parseResult.error;

          logger.error("[FileTool] Failed to parse code edit response", {
            filename,
            attempt,
            error: lastError,
            zodErrors: parseResult.zodErrors,
            rawError: parseResult.error,
            rawResponse: rawResponse.substring(0, 1000),
            fullRawResponse: rawResponse, // Log complet pour debug
          });

          if (process.env.DEBUG === "true") {
            console.log(chalk.red(`[FileTool] Parse error: ${lastError}`));
          }

          if (attempt === maxRetries) {
            logger.error("[FileTool] All retry attempts exhausted for edit", {
              filename,
              maxRetries,
              finalError: lastError,
            });

            return {
              success: false,
              error: `Failed to edit code after ${maxRetries} attempts. Last error: ${lastError}`,
            };
          }
        }
      }

      return {
        success: false,
        error: "Code editing failed (unexpected end of retry loop)",
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}
