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
  storage?: {
    enabled?: boolean;
    driver?: "fs" | "memory";
    basePath?: string;
  };
}

export class Agent {
  private memory: AgentMemory;
  private vfs: VirtualFileSystem;
  private fileManager: FileManager;
  private executor: CodeExecutor;
  private llmClient: OpenRouterClient;
  private todoManager: TodoManager;
  private storageManager: StorageManager | null = null;
  private projectName: string;
  private lastActions: Array<{ tool: string; result: any }> = [];
  private config: AgentConfig; // Store config for reload

  constructor(config: AgentConfig) {
    this.config = config; // Save for later reload
    // Initialize components
    this.memory = new AgentMemory(10);
    this.vfs = new VirtualFileSystem();
    this.fileManager = new FileManager(this.vfs);
    this.executor = new CodeExecutor();
    this.todoManager = new TodoManager();

    // Generate project name (timestamp-based)
    this.projectName = `project_${Date.now()}`;

    // Initialize LLM client
    this.llmClient = this.createLLMClient();

    // Initialize storage if enabled
    if (config.storage?.enabled !== false) {
      const driver = new UnstorageDriver({
        driver: config.storage?.driver || "fs",
        base: config.storage?.basePath || "./.agent-storage",
      });
      this.storageManager = new StorageManager(driver);
    }

    // Add system prompt to memory
    this.memory.addMessage("system", SYSTEM_PROMPT);

    // Try to restore last session if storage is enabled
    if (this.storageManager) {
      this.restoreLastSession().catch(() => {
        // Silent fail - start fresh if no session
      });
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
  async processRequest(userMessage: string): Promise<{ message: string }> {
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

        // Call LLM to get JSON response (custom system!)
        const response = await this.llmClient.chat(messages);

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

        // Log parsed response
        logger.info("Agent response parsed", {
          mode: agentResponse.mode,
          actionsCount: agentResponse.actions.length,
          tools: agentResponse.actions.map((a) => a.tool),
          reasoning: agentResponse.reasoning?.substring(0, 100),
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

        // Display agent's reasoning (from JSON response) if present
        if (agentResponse.reasoning) {
          console.log(chalk.yellow("\n🤔 Agent's plan:"));
          console.log(chalk.dim(agentResponse.reasoning));
          console.log();
        }

        // Execute actions based on mode
        console.log(chalk.cyan(`\n🔧 Actions (${agentResponse.mode}):`));

        let shouldStop = false;
        const hasStopAction = agentResponse.actions.some(
          (a) => a.tool === "stop"
        );

        // Check for stop - if present, it's validated to be alone or last
        if (hasStopAction) {
          // If stop is alone, we break immediately
          if (agentResponse.actions.length === 1) {
            console.log(chalk.green("\n  ✓ Stop requested - finishing"));
            break;
          }
          // If stop is not alone, it must be last - we'll hit it during sequential execution
        }

        // Execute based on mode
        if (agentResponse.mode === "parallel") {
          // Execute all actions in parallel with Promise.all
          const results = await Promise.all(
            agentResponse.actions.map(async (action) => {
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
          // Sequential execution - one by one
          for (const action of agentResponse.actions) {
            // If we hit stop, we break the loop and finish
            if (action.tool === "stop") {
              console.log(chalk.green("\n  ✓ Stop requested - finishing"));
              shouldStop = true;
              break;
            }

            console.log(chalk.cyan(`  ➤ ${action.tool}`));
            if (process.env.DEBUG === "true") {
              console.log(
                chalk.dim(
                  `     Args: ${JSON.stringify(action.args).substring(0, 100)}`
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

              // Add result to messages for next action
              messages.push({
                role: "user",
                content: `${action.tool} result: ${JSON.stringify(result)}`,
              });
            } catch (error) {
              Display.error(`    ✗ ${(error as Error).message}`);
              messages.push({
                role: "user",
                content: `${action.tool} error: ${(error as Error).message}`,
              });
            }
          }

          // If we stopped mid-execution, break the main loop
          if (shouldStop) {
            break;
          }
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

    // Save session at the end of request
    if (this.storageManager?.isAutoSaveEnabled()) {
      await this.saveCurrentSession();
    }

    return { message: finalMessage || "Task completed." };
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
          const content = this.vfs.readFile(file.path);
          const filePath = join(projectDir, file.path);

          const fileDir = join(
            projectDir,
            file.path.substring(0, file.path.lastIndexOf("/") || 0)
          );
          if (fileDir !== projectDir && !existsSync(fileDir)) {
            mkdirSync(fileDir, { recursive: true });
          }

          writeFileSync(filePath, content, "utf8");
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
          const content = readFileSync(fullPath, "utf8");
          this.vfs.writeFile(relativePath, content);
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
   * Sauvegarde la session actuelle dans le storage
   */
  private async saveCurrentSession(): Promise<void> {
    if (!this.storageManager) return;

    try {
      // Récupère tous les fichiers du VFS
      const files: Record<string, string> = {};
      const allFiles = this.vfs.listFiles().filter((f) => !f.isDirectory);
      for (const file of allFiles) {
        files[file.path] = this.vfs.readFile(file.path);
      }

      // Récupère les messages (simplifié)
      const messages = this.memory.getMessages().map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Récupère les todos
      const todos = this.todoManager.listTodos().map((todo) => ({
        task: todo.task,
        completed: todo.completed,
        createdAt: todo.createdAt.toISOString(),
      }));

      // Récupère la config modèle depuis storage si dispo
      const modelConfig = this.storageManager?.getModelConfig();

      const sessionData: SessionData = {
        projectName: this.projectName,
        files,
        messages,
        todos,
        modelConfig,
        metadata: {
          lastSaved: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await this.storageManager.saveSession(sessionData);
    } catch (error) {
      // Silent fail - pas critique
      if (process.env.DEBUG === "true") {
        console.error(chalk.gray("Note: Could not save session"));
      }
    }
  }

  /**
   * Restaure la dernière session depuis le storage
   */
  private async restoreLastSession(): Promise<void> {
    if (!this.storageManager) return;

    try {
      // Liste toutes les sessions et prend la plus récente
      const sessions = await this.storageManager.listSessions();
      if (sessions.length === 0) return;

      // Trier par date (les IDs contiennent le timestamp)
      const sortedSessions = sessions.sort().reverse();
      const latestSession = sortedSessions[0];

      const sessionData = await this.storageManager.loadSession(latestSession);
      if (!sessionData) return;

      // Restaure le nom du projet
      this.projectName = sessionData.projectName;

      // Restaure les fichiers dans le VFS
      this.vfs.reset();
      for (const [path, content] of Object.entries(sessionData.files)) {
        this.vfs.writeFile(path, content);
      }

      // Restaure les messages (reset memory first)
      this.memory = new AgentMemory(10);
      this.memory.addMessage("system", SYSTEM_PROMPT);
      for (const msg of sessionData.messages) {
        if (msg.role !== "system") {
          this.memory.addMessage(msg.role as any, msg.content || "");
        }
      }

      // Restaure les todos
      this.todoManager.clearTodos();
      for (const todo of sessionData.todos) {
        this.todoManager.addTodo(todo.task);
        if (todo.completed) {
          this.todoManager.completeTodo(todo.task);
        }
      }

      console.log(
        chalk.green(`\n📂 Session restored: ${latestSession}`) +
          chalk.gray(
            ` (${Object.keys(sessionData.files).length} files, ${
              sessionData.messages.length
            } messages)`
          )
      );
    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Obtient le storage manager (pour les commandes)
   */
  getStorageManager(): StorageManager | null {
    return this.storageManager;
  }

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
