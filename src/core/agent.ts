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
import { ToolParser, type ParsedToolCall } from "../llm/tool-parser.js";
import { TodoManager } from "./todo-manager.js";
import { StorageManager } from "../storage/storage-manager.js";
import { UnstorageDriver } from "../storage/unstorage-driver.js";
import type { SessionData } from "../storage/storage-driver.js";
import logger, {
  logToolCall,
  logLLMRequest,
  logThinking,
  logError,
} from "../utils/logger.js";
import { toolRegistry } from "../tools/index.js";

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
  private toolParser: ToolParser;
  private todoManager: TodoManager;
  private storageManager: StorageManager | null = null;
  private projectName: string;
  private lastActions: Array<{ tool: string; result: any }> = [];

  constructor(config: AgentConfig) {
    // Initialize components
    this.memory = new AgentMemory(10);
    this.vfs = new VirtualFileSystem();
    this.fileManager = new FileManager(this.vfs);
    this.executor = new CodeExecutor();
    this.toolParser = new ToolParser();
    this.todoManager = new TodoManager();

    // Generate project name (timestamp-based)
    this.projectName = `project_${Date.now()}`;

    this.llmClient = new OpenRouterClient({
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature,
      reasoning: config.reasoning,
      tools: toolRegistry.getToolDefinitions(), // Tools from registry!
    });

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

        // Call LLM WITHOUT streaming (actions only - no text output)
        // L'agent ne parle pas directement, il appelle juste des tools!
        const response = await this.llmClient.chat(messages);

        // Extract tool calls from response
        const assistantMessage = response.message;
        const currentToolCalls = assistantMessage.tool_calls || [];

        // Debug info if enabled
        if (process.env.DEBUG === "true") {
          console.log(chalk.dim(`\n[Iteration ${iterationCount}]`));
          if (currentToolCalls.length > 0) {
            console.log(chalk.dim(`Tool calls: ${currentToolCalls.length}`));
          }
        }

        // Add assistant message to history
        messages.push(assistantMessage);

        // If we have tool calls, execute them
        if (currentToolCalls.length > 0) {
          console.log(chalk.cyan("\n🔧 Actions:"));

          // Parse and execute each tool call
          const parsedToolCalls = this.toolParser.parseToolCalls({
            role: "assistant",
            content: assistantMessage.content,
            tool_calls: currentToolCalls,
          });

          let shouldStop = false;
          const hasStopCall = parsedToolCalls.some((tc) => tc.name === "stop");

          // 🚨 CRITICAL RULE: `stop` must be called ALONE!
          if (hasStopCall && parsedToolCalls.length > 1) {
            console.log();
            Display.error(
              "⚠️  WARNING: 'stop' tool must be called ALONE in final iteration!"
            );
            Display.error(
              "    The stop call will be ignored. Please call stop by itself."
            );
            console.log();
            // Remove stop from the list and continue
            parsedToolCalls.splice(
              parsedToolCalls.findIndex((tc) => tc.name === "stop"),
              1
            );
          }

          for (const toolCall of parsedToolCalls) {
            // Track if we should stop
            if (toolCall.name === "stop") {
              shouldStop = true;
            }

            // Don't display send_message (it's in the streamed content already)
            if (toolCall.name === "send_message") {
              // Execute silently
              const result = await this.executeTool(toolCall);
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });
              continue;
            }

            // Display what we're doing avec détails!
            console.log(
              "\n" +
                chalk.cyan("  ➤ ") +
                this.toolParser.formatToolCall(toolCall)
            );

            // Affiche les détails de l'action en debug
            if (process.env.DEBUG === "true") {
              this.displayToolDetails(toolCall);
            }

            // Validate tool call
            const validation = this.toolParser.validateToolCall(toolCall);
            if (!validation.valid) {
              // Add error result
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: validation.error }),
              });
              Display.error(`    ✗ ${validation.error}`);
              continue;
            }

            // Execute tool
            const startTime = Date.now();
            const result = await this.executeTool(toolCall);
            const duration = Date.now() - startTime;

            // Add tool result to messages
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });

            // Show success avec timing
            if (result.success) {
              const timing =
                duration > 100
                  ? chalk.yellow(` (${duration}ms)`)
                  : chalk.gray(` (${duration}ms)`);
              console.log(chalk.green("    ✓ Done") + timing);

              // Affiche le résultat en mode debug
              if (process.env.DEBUG === "true" && result.output) {
                console.log(
                  chalk.gray(
                    `    Output: ${result.output.substring(0, 100)}...`
                  )
                );
              }
            } else if (result.error) {
              Display.error(`    ✗ ${result.error}`);
            }
          }

          // Si l'agent a appelé stop, il a fini!
          if (shouldStop) {
            console.log();
            Display.info("🏁 Agent stopped - all tasks complete!");
            finalMessage = "Task completed.";
            break;
          }

          // Continue loop to get next response
          continue;
        }

        // No tool calls - loop stops automatically (empty response)
        console.log();
        Display.info(
          "🏁 Loop stopped - no tool calls requested (agent finished)"
        );
        finalMessage = assistantMessage.content || "Task completed.";
        this.memory.addMessage("assistant", finalMessage);
        break;
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
   */
  private async executeTool(toolCall: ParsedToolCall): Promise<any> {
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
    // Clear VFS for fresh start
    this.vfs = new VirtualFileSystem();
    this.fileManager = new FileManager(this.vfs);
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
   */
  private displayToolDetails(toolCall: ParsedToolCall): void {
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
