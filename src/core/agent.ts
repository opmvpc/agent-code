// src/core/agent.ts
/**
 * Main Agent - Le cerveau de l'opération
 * Enfin... un cerveau artificiel qui essaie en tout cas 🧠
 */

import { AgentMemory } from "./memory.js";
import { VirtualFileSystem } from "../filesystem/virtual-fs.js";
import { FileManager } from "../filesystem/file-manager.js";
import { CodeExecutor } from "../executor/code-runner.js";
import { OpenRouterClient, type ReasoningOptions } from "../llm/openrouter.js";
import {
  SYSTEM_PROMPT,
  getSystemPrompt,
  getContextPrompt,
} from "../llm/prompts.js";
import { Display } from "../cli/display.js";
import boxen from "boxen";
import {
  readdirSync,
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import chalk from "chalk";
import { TodoManager } from "./todo-manager.js";
import { StorageManager } from "../storage/storage-manager.js";
import { UnstorageDriver } from "../storage/unstorage-driver.js";
import type { ToolResult } from "../tools/base-tool.js";
import type { SessionData } from "../storage/storage-driver.js";
import logger, {
  logToolCall,
  logLLMRequest,
  logThinking,
  logError,
  logToolCallsRequested,
  logAssistantResponse,
} from "../utils/logger.js";
import { toolRegistry } from "../tools/index.js";
import { parseWithRetry } from "./agent-parser.js";
import type { AgentResponse } from "../llm/response-schema.js";

export interface AgentConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  debug?: boolean;
  reasoning?: ReasoningOptions;
  // New: Project and conversation context
  projectName: string;
  conversationId: string;
  projectManager?: any; // ProjectManager instance
}

export class Agent {
  private memory: AgentMemory;
  private vfs: VirtualFileSystem;
  private fileManager: FileManager;
  private executor: CodeExecutor;
  private llmClient: OpenRouterClient;
  private todoManager: TodoManager;
  private projectName: string;
  private conversationId: string;
  private projectManager: any | null = null;
  private vfsModified: boolean = false; // Track if VFS has changes
  private lastActions: Array<{ tool: string; result: any }> = [];
  private config: AgentConfig; // Store config for reload

  constructor(config: AgentConfig) {
    this.config = config; // Save for later reload

    // Set project context
    this.projectName = config.projectName;
    this.conversationId = config.conversationId;
    this.projectManager = config.projectManager || null;

    // Initialize components (30 messages max pour garder le contexte! 🧠)
    this.memory = new AgentMemory(30);
    this.vfs = new VirtualFileSystem();
    this.fileManager = new FileManager(this.vfs);
    this.executor = new CodeExecutor();
    this.todoManager = new TodoManager();

    // Initialize LLM client
    this.llmClient = this.createLLMClient();

    // Add system prompt to memory
    this.memory.addMessage("system", SYSTEM_PROMPT);

    // Load conversation data if available
    if (this.projectManager) {
      this.loadConversation();
    }
  }

  /**
   * Affiche un debug box ROUGE avec les infos importantes 🔴
   */
  private displayDebugBox(
    iteration: number,
    thinkingTrace: string,
    toolCalls: any[],
    stats: any
  ): void {
    const debugInfo: string[] = [];

    debugInfo.push(chalk.yellow(`🔄 Iteration: ${iteration}`));
    debugInfo.push("");

    // Trace de raisonnement
    if (thinkingTrace) {
      debugInfo.push(chalk.cyan("💭 Thinking Trace:"));
      debugInfo.push(chalk.dim(thinkingTrace.trim().slice(0, 300))); // Max 300 chars
      if (thinkingTrace.length > 300) {
        debugInfo.push(chalk.dim("..."));
      }
      debugInfo.push("");
    }

    // Liste des outils demandés
    if (toolCalls.length > 0) {
      debugInfo.push(chalk.cyan(`🔧 Tool Calls (${toolCalls.length} total):`));
      debugInfo.push("");
      toolCalls.forEach((call: any, index: number) => {
        const toolName = call.function?.name || "unknown";
        const args = call.function?.arguments || "{}";
        let parsedArgs: any = {};
        try {
          parsedArgs = JSON.parse(args);
        } catch {
          parsedArgs = { raw: args };
        }
        debugInfo.push(chalk.white(`  ${index + 1}. ${toolName}`));
        const argKeys = Object.keys(parsedArgs);
        if (argKeys.length > 0 && argKeys.length <= 3) {
          // Montrer max 3 arguments pour garder lisible
          argKeys.slice(0, 3).forEach((key) => {
            const value =
              typeof parsedArgs[key] === "string"
                ? parsedArgs[key].slice(0, 40)
                : JSON.stringify(parsedArgs[key]).slice(0, 40);
            debugInfo.push(
              chalk.gray(
                `     ${key}: ${value}${
                  parsedArgs[key].length > 40 ? "..." : ""
                }`
              )
            );
          });
        } else if (argKeys.length > 3) {
          debugInfo.push(chalk.gray(`     (${argKeys.length} arguments)`));
        }
      });
      debugInfo.push("");
    }

    // Usage stats
    if (stats) {
      debugInfo.push(chalk.cyan("📊 Token Usage:"));
      debugInfo.push(chalk.white(`  Total: ${stats.totalTokens || 0}`));
      if (stats.totalReasoningTokens > 0) {
        debugInfo.push(
          chalk.yellow(`  Reasoning: ${stats.totalReasoningTokens}`)
        );
      }
      if (stats.totalCachedTokens > 0) {
        debugInfo.push(chalk.green(`  Cached: ${stats.totalCachedTokens}`));
      }
      if (stats.totalCost > 0) {
        debugInfo.push(chalk.magenta(`  Cost: $${stats.totalCost.toFixed(6)}`));
      }
    }

    // Box rouge!
    const box = boxen(debugInfo.join("\n"), {
      padding: 1,
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
      borderColor: "red",
      borderStyle: "round",
      title: "🐛 DEBUG",
      titleAlignment: "left",
    });

    console.log(box);
  }

  /**
   * Process user request avec agentic loop + STREAMING! 🌊
   */
  async processRequest(
    userMessage: string
  ): Promise<{ message: string; shouldGenerateTitle?: boolean }> {
    // Check if this is the first user message (BEFORE adding it!)
    const isFirstMessage =
      this.memory.getMessages().filter((m) => m.role === "user").length === 0;
    // Add user message to memory
    this.memory.addMessage("user", userMessage);
    this.memory.addTaskToHistory(userMessage);

    // Update system prompt with current todolist state (dynamic injection!)
    const systemPromptWithTodos = getSystemPrompt(this.todoManager.listTodos());
    this.memory.updateSystemMessage(systemPromptWithTodos);

    // Get context
    const context = this.memory.getContext();
    const contextPrompt = getContextPrompt({
      ...context,
      currentProject: this.projectName,
    });

    // Build messages for LLM
    const messages: any[] = this.memory.getMessages();
    if (contextPrompt) {
      messages.push({
        role: "system",
        content: contextPrompt,
      });
    }

    // Agentic loop avec STREAMING! 🌊
    const maxIterations = 10;
    let iterationCount = 0;
    let finalMessage = "";

    while (iterationCount < maxIterations) {
      iterationCount++;

      // Pas de spam iterations ici, on affiche que les infos utiles plus tard

      try {
        // Log requête LLM
        logLLMRequest(
          this.llmClient.getModel(),
          messages.length,
          this.llmClient.getReasoningConfig()
        );

        // Import structured outputs schema dynamically to avoid circular deps
        const { getAgentResponseJsonSchema } = await import(
          "../llm/response-schema.js"
        );
        const responseFormat = getAgentResponseJsonSchema();

        // Call LLM to get JSON response with structured outputs! 🎯
        const response = await this.llmClient.chat(messages, {
          responseFormat,
        });

        // Extract message and reasoning
        const message = response.choices?.[0]?.message;
        const responseText = message?.content || "";
        const reasoning = message?.reasoning;

        // Log full API response for debugging
        logger.info("Raw API response received", {
          hasChoices: !!response.choices,
          choicesLength: response.choices?.length,
          firstChoice: response.choices?.[0]
            ? {
                hasMessage: !!message,
                messageRole: message?.role,
                contentLength: responseText.length,
                hasReasoning: !!reasoning,
                reasoningLength: reasoning?.length,
                finishReason: response.choices[0].finish_reason,
              }
            : null,
        });

        // Log reasoning if present
        if (reasoning) {
          logger.info("Reasoning trace", {
            reasoning,
            length: reasoning.length,
          });

          // Display reasoning in UI
          console.log(chalk.magenta("\n💭 Reasoning:"));
          console.log(chalk.dim(reasoning));
          console.log();
        }

        // Add assistant response to history
        messages.push({
          role: "assistant",
          content: responseText,
        });

        // Parse JSON response avec retry si erreur Zod
        const parseResult = await parseWithRetry(
          responseText,
          messages,
          this.llmClient
        );

        if (!parseResult.success || !parseResult.data) {
          logger.error("Failed to parse response after retries", {
            error: parseResult.error,
            retries: parseResult.retryCount,
          });
          throw new Error(
            `Failed to parse agent response: ${parseResult.error}`
          );
        }

        const agentResponse = parseResult.data;

        // CRITICAL: Add agent's JSON response to memory as assistant message
        // This preserves what tools the agent decided to call
        this.memory.addMessage("assistant", responseText);

        // Log parsed response
        logger.info("Agent response parsed", {
          mode: agentResponse.mode,
          actionsCount: agentResponse.actions.length,
          tools: agentResponse.actions.map((a) => a.tool),
        });

        // Debug info
        if (process.env.DEBUG === "true") {
          console.log(
            chalk.dim(
              `\n[Iteration ${iterationCount}] Mode: ${agentResponse.mode}`
            )
          );
          console.log(chalk.dim(`Actions: ${agentResponse.actions.length}`));
        }

        // Check if actions array is empty (one way to stop)
        if (agentResponse.actions.length === 0) {
          console.log(chalk.green("\n✅ Agent finished - no more actions"));
          break;
        }

        // Execute actions based on mode
        console.log(chalk.cyan(`\n🔧 Actions (${agentResponse.mode}):`));

        // Detect stop action anywhere in the list
        const hasStopAction = agentResponse.actions.some(
          (a) => a.tool === "stop"
        );

        // Filter out stop from actions to execute (stop is just a signal, not a real tool)
        const actionsToExecute = agentResponse.actions.filter(
          (a) => a.tool !== "stop"
        );

        if (hasStopAction) {
          console.log(
            chalk.yellow(
              "\n  🛑 Stop signal detected - will end after this iteration"
            )
          );
        }

        // Execute based on mode
        if (agentResponse.mode === "parallel") {
          // Execute all actions in parallel with Promise.all (excluding stop)
          const results = await Promise.all(
            actionsToExecute.map(async (action) => {
              console.log(chalk.cyan(`  ➤ ${action.tool}`));
              if (process.env.DEBUG === "true") {
                console.log(
                  chalk.dim(
                    `     Args: ${JSON.stringify(action.args).substring(
                      0,
                      100
                    )}`
                  )
                );
              }

              const startTime = Date.now();
              try {
                const result = await toolRegistry.execute(
                  action.tool,
                  action.args,
                  this
                );
                const duration = Date.now() - startTime;

                // Show result
                if (result.success) {
                  console.log(
                    chalk.green(`    ✓ Done`) + chalk.gray(` (${duration}ms)`)
                  );
                } else {
                  Display.error(`    ✗ ${result.error}`);
                }

                return { action, result, success: result.success };
              } catch (error) {
                Display.error(`    ✗ ${(error as Error).message}`);
                return {
                  action,
                  result: { error: (error as Error).message },
                  success: false,
                };
              }
            })
          );

          // Add results to messages as context
          const resultsText = results
            .map(
              (r) =>
                `${r.action.tool}: ${r.success ? "success" : r.result.error}`
            )
            .join(", ");
          messages.push({
            role: "user",
            content: `Results: ${resultsText}`,
          });
        } else {
          // Sequential execution - one by one (excluding stop)
          for (const action of actionsToExecute) {
            console.log(chalk.cyan(`  ➤ ${action.tool}`));
            if (process.env.DEBUG === "true") {
              console.log(
                chalk.dim(
                  `     Args: ${JSON.stringify(action.args).substring(0, 100)}`
                )
              );
            }

            // Generate unique tool call ID (format compatible with OpenAI/OpenRouter)
            const toolCallId = `call_${Date.now()}_${Math.random()
              .toString(36)
              .substring(2, 11)}`;

            const startTime = Date.now();
            try {
              const result = await toolRegistry.execute(
                action.tool,
                action.args,
                this
              );
              const duration = Date.now() - startTime;

              // Show result
              if (result.success) {
                console.log(
                  chalk.green(`    ✓ Done`) + chalk.gray(` (${duration}ms)`)
                );
              } else {
                Display.error(`    ✗ ${result.error}`);
              }

              // CRITICAL: Add result to messages for next action
              // ALL tools (including send_message) are stored as tool results!
              // The agent should ONLY see JSON in its own messages (role: assistant)
              const toolSummary = this.createToolResultSummary(
                action.tool,
                result
              );

              // Add as proper "tool" role with toolCallId (standard LLM format)
              messages.push({
                role: "tool",
                content: toolSummary,
                toolCallId: toolCallId,
              });

              // Save tool result to memory with proper metadata
              this.memory.addToolResult(action.tool, toolSummary, toolCallId);
            } catch (error) {
              Display.error(`    ✗ ${(error as Error).message}`);
              messages.push({
                role: "user",
                content: `${action.tool} error: ${(error as Error).message}`,
              });
            }
          }
        }

        // If stop was requested, break the main loop after completing all actions
        if (hasStopAction) {
          console.log(chalk.green("\n✅ Stopping agent loop"));
          break;
        }

        // Continue to next iteration
        continue;
      } catch (error) {
        throw new Error(
          `Failed to process request: ${(error as Error).message}`
        );
      }
    }

    if (iterationCount >= maxIterations) {
      console.warn(chalk.yellow("\n⚠️  Max iterations reached"));
    }

    // Auto-save conversation data
    this.saveConversation();

    // Export to workspace/ if VFS has changes (always export to show current state)
    if (this.projectManager) {
      try {
        this.projectManager.exportToWorkspace(
          this.projectName,
          this.getVFSSnapshot()
        );

        const fileCount = Object.keys(this.getVFSSnapshot()).length;
        if (fileCount > 0) {
          console.log(
            chalk.green(
              `\n📁 Workspace exported: workspace/${this.projectName}/ (${fileCount} files)`
            )
          );
        }
      } catch (error) {
        logger.error("Failed to export to workspace", {
          error: (error as Error).message,
        });
      }
    }

    return {
      message: finalMessage || "Task completed.",
      shouldGenerateTitle: isFirstMessage, // Signal qu'il faut générer un titre
    };
  }

  /**
   * Create a concise, human-readable summary of tool execution result
   * Instead of dumping full JSON, create a SHORT message the AI can understand!
   */
  private createToolResultSummary(
    toolName: string,
    result: ToolResult
  ): string {
    if (!result.success) {
      return `❌ ${toolName} failed: ${result.error}`;
    }

    // PRIORITY: If tool provides a formatted message, use it!
    // Tools like file (read/write/edit) and websearch include full content in message
    if (result.message) {
      return result.message;
    }

    // Fallback summaries for tools that don't provide formatted messages
    switch (toolName) {
      case "file":
        if (result.action === "write") {
          return `✅ File created: ${result.filename} (${result.lines} lines)`;
        } else if (result.action === "edit") {
          return `✅ File edited: ${result.filename} (${result.lines} lines)`;
        } else if (result.action === "read") {
          return `✅ File read: ${result.filename} (${result.lines} lines, ${result.size} bytes)`;
        } else if (result.action === "delete") {
          return `✅ File deleted: ${result.filename}`;
        } else if (result.action === "list") {
          return `✅ Listed ${result.count} file(s):\n\n${
            result.tree || "No files in workspace"
          }`;
        }
        break;

      case "todo":
        if (result.action === "add") {
          const count = Array.isArray(result.tasks) ? result.tasks.length : 1;
          return `✅ Added ${count} todo(s) to the list`;
        } else if (result.action === "markasdone") {
          return `✅ Marked todo as done: "${result.task}"`;
        } else if (result.action === "delete") {
          return `✅ Deleted todo: "${result.task}"`;
        } else if (result.action === "reset") {
          return `✅ Cleared all todos`;
        }
        break;

      case "execute":
        if (result.output) {
          const preview = result.output.substring(0, 100);
          return `✅ Code executed successfully. Output: ${preview}${
            result.output.length > 100 ? "..." : ""
          }`;
        }
        return `✅ Code executed successfully (no output)`;

      case "stop":
        return `✅ Agent stopped`;

      case "websearch":
        // Websearch should always provide formatted message, but just in case
        return `✅ Web search completed for: ${result.query}`;

      default:
        return `✅ ${toolName} completed successfully`;
    }

    // Final fallback
    return `✅ ${toolName} completed`;
  }

  /**
   * Execute a single tool call and return result
   * Using the new ToolRegistry system! 🎯
   * NOTE: This method is no longer used with the JSON-based tool calling
   */
  private async executeTool(toolCall: any): Promise<any> {
    const startTime = Date.now();

    try {
      logger.info(`Executing tool: ${toolCall.name}`, {
        tool: toolCall.name,
        arguments: toolCall.arguments,
      });

      // Execute via registry (handles routing, validation, errors)
      const result = await toolRegistry.execute(
        toolCall.name,
        toolCall.arguments,
        this // Pass agent instance to tools
      );

      // Log successful execution
      const duration = Date.now() - startTime;
      logToolCall(toolCall.name, toolCall.arguments, result);
      logger.info(`Tool completed: ${toolCall.name} (${duration}ms)`);

      // Track last actions (pour send_message context)
      this.addLastAction(toolCall.name, result);

      // Display output for certain tools (for user feedback)
      this.displayToolOutput(toolCall.name, toolCall.arguments, result);

      return result;
    } catch (error) {
      // Log error
      logToolCall(toolCall.name, toolCall.arguments, undefined, error);
      logError(`Tool execution: ${toolCall.name}`, error as Error);

      return { error: (error as Error).message };
    }
  }

  /**
   * Display output for certain tools (user feedback)
   */
  private displayToolOutput(
    toolName: string,
    args: Record<string, any>,
    result: any
  ): void {
    switch (toolName) {
      case "write_file":
        if (result.success) {
          Display.success(`File written: ${args.filename}`);
          const info = this.fileManager.displayFileInfo(args.filename);
          console.log(info);

          // Show code preview for previewable files
          const ext = args.filename.split(".").pop();
          const previewableExts = ["js", "ts", "json", "html", "css"];
          if (previewableExts.includes(ext || "")) {
            const languageMap: Record<string, string> = {
              js: "javascript",
              ts: "typescript",
              json: "json",
              html: "html",
              css: "css",
            };
            Display.code(args.content, languageMap[ext || "javascript"]);
          }
        }
        break;

      case "read_file":
        if (result.success && result.content) {
          const ext = args.filename.split(".").pop() || "txt";
          const languageMap: Record<string, string> = {
            js: "javascript",
            ts: "typescript",
            json: "json",
            html: "html",
            css: "css",
            md: "markdown",
            txt: "text",
          };
          Display.code(result.content, languageMap[ext] || "text");
        }
        break;

      case "execute_code":
        if (result.output || result.error) {
          Display.executionResult(
            result.output || result.error,
            result.success,
            result.executionTime
          );
        }
        if (!result.success) {
          Display.warning(
            "Code execution failed! You can:\n" +
              "  1. Ask me to fix the error\n" +
              "  2. Modify the code manually\n" +
              "  3. Try a different approach"
          );
        }
        break;

      case "list_files":
        if (result.success) {
          const tree = this.fileManager.displayFileTree();
          console.log(tree);
        }
        break;

      case "delete_file":
        if (result.success) {
          Display.success(`File deleted: ${args.filename}`);
        }
        break;

      case "create_project":
      case "switch_project":
        if (result.success) {
          Display.success(result.message || `Project: ${result.project}`);
        }
        break;

      case "list_projects":
        if (result.success && result.projects) {
          Display.info(
            `Available projects (${result.count}):\n` +
              result.projects
                .map(
                  (p: string) =>
                    `  • ${p}${p === result.current ? " (current)" : ""}`
                )
                .join("\n")
          );
        }
        break;
    }
  }

  // ========================================================================
  // PUBLIC GETTERS - Used by tools and command handlers
  // ========================================================================

  /**
   * Get memory instance (for command handler)
   */
  getMemory(): AgentMemory {
    return this.memory;
  }

  /**
   * Get VFS instance (for command handler)
   */
  getVFS(): VirtualFileSystem {
    return this.vfs;
  }

  /**
   * Get file manager instance (for command handler)
   */
  getFileManager(): FileManager {
    return this.fileManager;
  }

  /**
   * Get LLM client instance (for command handler)
   */
  /**
   * Créer une instance LLM client (factory method)
   */
  private createLLMClient(): OpenRouterClient {
    return new OpenRouterClient({
      apiKey: this.config.apiKey,
      model: this.config.model,
      temperature: this.config.temperature || 1.0,
      reasoning: this.config.reasoning,
      tools: [], // Tools are now in the prompt!
    });
  }

  /**
   * Recharger la config du modèle (appliqué immédiatement!)
   */
  reloadModelConfig(model: string, reasoning?: ReasoningOptions): void {
    this.config.model = model;
    this.config.reasoning = reasoning;

    // Recréer l'instance LLM avec la nouvelle config
    this.llmClient = this.createLLMClient();

    console.log(chalk.green("\n✅ Model reloaded and active immediately!"));
    console.log(chalk.dim(`   Now using: ${model}`));
  }

  getLLMClient(): OpenRouterClient {
    return this.llmClient;
  }

  /**
   * Get todo manager instance (for command handler)
   */
  getTodoManager(): TodoManager {
    return this.todoManager;
  }

  getLastActions(): Array<{ tool: string; result: any }> {
    return this.lastActions.slice(-10); // Dernières 10 actions
  }

  addLastAction(tool: string, result: any): void {
    this.lastActions.push({ tool, result });
    if (this.lastActions.length > 20) {
      this.lastActions = this.lastActions.slice(-20); // Garde les 20 dernières
    }
  }

  /**
   * Get code executor instance (for tools)
   */
  getExecutor(): CodeExecutor {
    return this.executor;
  }

  /**
   * Get current project name
   */
  getProjectName(): string {
    return this.projectName;
  }

  getConversationId(): string {
    return this.conversationId;
  }

  /**
   * Check if VFS has been modified
   */
  hasVFSChanges(): boolean {
    return this.vfsModified;
  }

  /**
   * Mark VFS as modified (called by tools when files change)
   */
  markVFSModified(): void {
    this.vfsModified = true;
  }

  /**
   * Get VFS snapshot (all files as JSON)
   */
  getVFSSnapshot(): Record<string, string> {
    const snapshot: Record<string, string> = {};
    const files = this.vfs.listFiles();

      for (const file of files) {
        if (!file.isDirectory) {
          try {
            snapshot[file.path] = this.vfs.serializeFileContent(file.path);
          } catch (error) {
            // Skip files that can't be read
            logger.warn(`Failed to read file for snapshot: ${file.path}`);
          }
        }
    }

    return snapshot;
  }

  /**
   * Load VFS from snapshot
   */
  loadVFSSnapshot(snapshot: Record<string, string>): void {
    this.vfs.reset();

    for (const [filePath, content] of Object.entries(snapshot)) {
      try {
        this.vfs.writeFileFromSerialized(filePath, content);
      } catch (error) {
        logger.error(`Failed to restore file from snapshot: ${filePath}`, {
          error: (error as Error).message,
        });
      }
    }

    this.vfsModified = false;
  }

  /**
   * Load conversation data from ProjectManager
   */
  private loadConversation(): void {
    if (!this.projectManager) {
      return;
    }

    try {
      const convData = this.projectManager.loadConversation(
        this.projectName,
        this.conversationId
      );

      // Restore messages
      convData.messages.forEach((msg: any) => {
        this.memory.addMessage(msg.role, msg.content);
      });

      // Restore todos
      convData.todos.forEach((todo: any) => {
        this.todoManager.addTodo(todo.task);
        if (todo.completed) {
          this.todoManager.completeTodo(todo.task);
        }
      });

      // Restore VFS from project level (shared across conversations!)
      const projectVfs = this.projectManager.loadProjectVFS(this.projectName);
      this.loadVFSSnapshot(projectVfs);

      logger.info("Conversation loaded", {
        project: this.projectName,
        conversation: this.conversationId,
        messages: convData.messages.length,
        todos: convData.todos.length,
        files: Object.keys(projectVfs).length,
      });
    } catch (error) {
      logger.warn("Could not load conversation, starting fresh", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Save conversation data to ProjectManager
   */
  private saveConversation(): void {
    if (!this.projectManager) {
      return;
    }

    try {
      const messages = this.memory.getMessages();

      // Save conversation data (messages + todos)
      // Messages include tool results with proper "tool" role and toolCallId
      this.projectManager.saveConversation(
        this.projectName,
        this.conversationId,
        {
          messages, // System, user, assistant, and tool messages
          todos: this.todoManager.listTodos(),
          // vfs removed - saved separately at project level
        }
      );

      // Save VFS at project level (shared across conversations!)
      this.projectManager.saveProjectVFS(
        this.projectName,
        this.getVFSSnapshot()
      );

      // Log full message history for debugging
      logger.info("Conversation saved", {
        project: this.projectName,
        conversation: this.conversationId,
        messageCount: messages.length,
      });

      // Log detailed message structure
      logger.info("Message history", {
        messages: messages.map((m) => ({
          role: m.role,
          contentLength: m.content?.length || 0,
          contentPreview: m.content?.substring(0, 100),
          toolCallId: m.toolCallId,
          timestamp: m.timestamp,
        })),
      });

      // In debug mode, also show in console
      if (process.env.DEBUG === "true") {
        console.log(chalk.gray("\n[Debug] Message History:"));
        messages.forEach((m, i) => {
          const preview = m.content?.substring(0, 80).replace(/\n/g, " ") || "";
          const toolInfo = m.toolCallId ? ` (toolCallId: ${m.toolCallId})` : "";
          console.log(
            chalk.dim(`  ${i + 1}. [${m.role}]${toolInfo}: ${preview}...`)
          );
        });
        console.log();
      }
    } catch (error) {
      logger.error("Failed to save conversation", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get workspace path (for tools)
   */
  getWorkspacePath(): string {
    return join(process.cwd(), "workspace");
  }

  /**
   * Set project name
   */
  setProjectName(name: string): void {
    // Sanitize project name (remove special chars)
    this.projectName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  // ========================================================================
  // PROJECT MANAGEMENT - Used by project tools
  // ========================================================================

  /**
   * Save current project to disk
   */
  async saveCurrentProject(): Promise<void> {
    try {
      const workspaceDir = join(process.cwd(), "workspace");
      const projectDir = join(workspaceDir, this.projectName);

      if (!existsSync(workspaceDir)) {
        mkdirSync(workspaceDir, { recursive: true });
      }

      if (!existsSync(projectDir)) {
        mkdirSync(projectDir, { recursive: true });
      }

      const files = this.vfs.listFiles();
      for (const file of files) {
        if (!file.isDirectory) {
          const isBinary = this.vfs.isBinaryFile(file.path);
          const content = isBinary
            ? this.vfs.readFileBuffer(file.path)
            : this.vfs.readFile(file.path);
          const filePath = join(projectDir, file.path);

          const fileDir = join(
            projectDir,
            file.path.substring(0, file.path.lastIndexOf("/") || 0)
          );
          if (fileDir !== projectDir && !existsSync(fileDir)) {
            mkdirSync(fileDir, { recursive: true });
          }

          if (isBinary) {
            writeFileSync(filePath, content);
          } else {
            writeFileSync(filePath, content, "utf8");
          }
        }
      }
    } catch (error) {
      // Silent fail - not critical
      console.error(chalk.gray(`Note: Could not auto-save project`));
    }
  }

  /**
   * Load project files from disk (internal helper)
   */
  private loadProjectFiles(projectDir: string): number {
    const loadFiles = (dir: string, basePath: string = ""): number => {
      const entries = readdirSync(dir, { withFileTypes: true });
      let count = 0;

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = basePath
          ? `${basePath}/${entry.name}`
          : entry.name;

        if (entry.isDirectory()) {
          count += loadFiles(fullPath, relativePath);
        } else {
          const isBinary = this.vfs.isBinaryExtension(entry.name);
          const content = isBinary
            ? readFileSync(fullPath)
            : readFileSync(fullPath, "utf8");
          this.fileManager.saveFile(relativePath, content);
          count++;
        }
      }

      return count;
    };

    return loadFiles(projectDir);
  }

  /**
   * Create a new project (public API for tools)
   */
  createProject(name: string): void {
    this.projectName = name;
    // Clear VFS for fresh start (don't replace, just reset!)
    this.vfs.reset();
    // FileManager keeps the same VFS reference, no need to recreate
  }

  /**
   * Switch to an existing project (public API for tools)
   */
  async switchProject(name: string): Promise<void> {
    await this.loadProjectFromDisk(name);
  }

  /**
   * List all projects (public API for tools)
   */
  listProjects(): string[] {
    const workspaceDir = join(process.cwd(), "workspace");

    if (!existsSync(workspaceDir)) {
      return [];
    }

    try {
      const entries = readdirSync(workspaceDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (error) {
      return [];
    }
  }

  /**
   * Load project from disk (public version for tools)
   */
  async loadProjectFromDisk(projectName: string): Promise<void> {
    const workspaceDir = join(process.cwd(), "workspace");
    const projectDir = join(workspaceDir, projectName);

    if (!existsSync(projectDir)) {
      throw new Error(`Project "${projectName}" not found`);
    }

    // Load files
    this.vfs.reset();
    this.loadProjectFiles(projectDir);
    this.setProjectName(projectName);
  }

  // ========================================================================
  // SESSION MANAGEMENT - Persistence
  // ========================================================================

  /**
   * Affiche les détails d'un tool call (mode debug)
   * NOTE: This method is no longer used with the JSON-based tool calling
   */
  private displayToolDetails(toolCall: any): void {
    const details: string[] = [];

    if (toolCall.arguments.filename) {
      details.push(`file: ${toolCall.arguments.filename}`);
    }
    if (toolCall.arguments.content) {
      const preview = toolCall.arguments.content.substring(0, 80);
      const truncated = toolCall.arguments.content.length > 80 ? "..." : "";
      details.push(`content: ${preview}${truncated}`);
    }
    if (toolCall.arguments.message) {
      details.push(`message: "${toolCall.arguments.message}"`);
    }
    if (toolCall.arguments.task) {
      details.push(`task: "${toolCall.arguments.task}"`);
    }
    if (toolCall.arguments.project_name) {
      details.push(`project: ${toolCall.arguments.project_name}`);
    }

    if (details.length > 0) {
      console.log(chalk.dim(`    ${details.join(", ")}`));
    }
  }
}
