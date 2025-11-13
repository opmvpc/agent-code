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
import { SYSTEM_PROMPT, getContextPrompt } from "../llm/prompts.js";
import { Display } from "../cli/display.js";
import {
  readdirSync,
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import chalk from "chalk";
import { AGENT_TOOLS } from "../llm/tools.js";
import { ToolParser, type ParsedToolCall } from "../llm/tool-parser.js";
import { TodoManager } from "./todo-manager.js";
import { StorageManager } from "../storage/storage-manager.js";
import { UnstorageDriver } from "../storage/unstorage-driver.js";
import type { SessionData } from "../storage/storage-driver.js";

export interface AgentConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
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
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      reasoning: config.reasoning,
      tools: AGENT_TOOLS, // Pass our tool definitions!
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
   * Process user request avec agentic loop + STREAMING! 🌊
   */
  async processRequest(userMessage: string): Promise<{ message: string }> {
    // Add user message to memory
    this.memory.addMessage("user", userMessage);
    this.memory.addTaskToHistory(userMessage);

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

      if (process.env.DEBUG === "true") {
        console.log(
          chalk.gray(`\n🔄 Iteration ${iterationCount}/${maxIterations}`)
        );
      }

      try {
        // Stream response from LLM
        const stream = this.llmClient.chatStream(messages);

        let currentContent = "";
        let currentToolCalls: any[] = [];
        let assistantMessage: any = {
          role: "assistant",
          content: null,
        };
        let hasThinking = false;
        let hasContent = false;

        // Process stream chunks
        for await (const chunk of stream) {
          if (chunk.type === "thinking") {
            // Display thinking header first time
            if (!hasThinking) {
              console.log(chalk.dim("\n💭 Thinking..."));
              hasThinking = true;
            }
            // Display thinking dimmed
            process.stdout.write(chalk.dim.italic(chunk.content));
          } else if (chunk.type === "content") {
            // Display content header first time
            if (!hasContent && !hasThinking) {
              console.log(chalk.cyan("\n💬 Response:"));
            }
            hasContent = true;
            // Display content as it streams
            process.stdout.write(chalk.white(chunk.content));
            currentContent += chunk.content;
          } else if (chunk.type === "tool_calls") {
            // Tool calls detected!
            console.log(); // New line after content
            currentToolCalls = chunk.tool_calls;
            assistantMessage.content = chunk.content;
            assistantMessage.tool_calls = currentToolCalls;
          } else if (chunk.type === "done") {
            // Regular completion without tools
            console.log(); // New line after content
            assistantMessage.content = chunk.content || currentContent;
            finalMessage = assistantMessage.content || "";
            this.memory.addMessage("assistant", finalMessage);
          } else if (chunk.type === "error") {
            throw new Error(`Stream error: ${chunk.error}`);
          } else if (chunk.type === "usage") {
            // Stats déjà gérés dans OpenRouterClient
            const tokens = chunk.usage.total_tokens || 0;
            console.log(chalk.gray(`\n📊 ${tokens} tokens used`));
          }
        }

        // Add assistant message to history
        messages.push(assistantMessage);

        // If we have tool calls, execute them
        if (currentToolCalls.length > 0) {
          console.log(chalk.cyan("\n\n🔧 Actions:\n"));

          // Parse and execute each tool call
          const parsedToolCalls = this.toolParser.parseToolCalls({
            role: "assistant",
            content: assistantMessage.content,
            tool_calls: currentToolCalls,
          });

          for (const toolCall of parsedToolCalls) {
            // Display what we're doing avec détails!
            console.log(
              chalk.cyan("  ➤ ") + this.toolParser.formatToolCall(toolCall)
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

          // Auto-save session after tool execution
          if (this.storageManager?.isAutoSaveEnabled()) {
            await this.saveCurrentSession();
          }

          // Continue loop to get next response
          continue;
        }

        // No tool calls - we're done!
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

    return { message: finalMessage || "Task completed." };
  }

  /**
   * Execute a single tool call and return result
   */
  private async executeTool(toolCall: ParsedToolCall): Promise<any> {
    try {
      switch (toolCall.name) {
        case "write_file":
          return await this.handleWriteFile(
            toolCall.arguments.filename,
            toolCall.arguments.content
          );

        case "read_file":
          return await this.handleReadFile(toolCall.arguments.filename);

        case "execute_code":
          return await this.handleExecuteCode(toolCall.arguments.filename);

        case "list_files":
          return await this.handleListFiles();

        case "delete_file":
          return await this.handleDeleteFile(toolCall.arguments.filename);

        case "create_project":
          return await this.handleCreateProject(
            toolCall.arguments.project_name
          );

        case "switch_project":
          return await this.handleSwitchProject(
            toolCall.arguments.project_name
          );

        case "list_projects":
          return await this.handleListProjects();

        case "send_message":
          return await this.handleSendMessage(toolCall.arguments.message);

        case "add_todo":
          return await this.handleAddTodo(toolCall.arguments.task);

        case "complete_todo":
          return await this.handleCompleteTodo(toolCall.arguments.task);

        case "list_todos":
          return await this.handleListTodos();

        case "clear_todos":
          return await this.handleClearTodos();

        default:
          return { error: `Unknown tool: ${toolCall.name}` };
      }
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  /**
   * Handle write file action
   */
  private async handleWriteFile(
    filename: string,
    content: string
  ): Promise<any> {
    this.vfs.writeFile(filename, content);
    this.memory.addFileCreated(filename);

    Display.success(`File written: ${filename}`);

    // Show file info
    const info = this.fileManager.displayFileInfo(filename);
    console.log(info);

    // Show code preview
    const ext = filename.split(".").pop();
    const previewableExts = ["js", "ts", "json", "html", "css"];
    if (previewableExts.includes(ext || "")) {
      const languageMap: Record<string, string> = {
        js: "javascript",
        ts: "typescript",
        json: "json",
        html: "html",
        css: "css",
      };
      Display.code(content, languageMap[ext || "javascript"]);
    }

    return { success: true, filename, size: content.length };
  }

  /**
   * Handle read file action
   */
  private async handleReadFile(filename: string): Promise<any> {
    const content = this.vfs.readFile(filename);

    const ext = filename.split(".").pop() || "txt";
    const languageMap: Record<string, string> = {
      js: "javascript",
      ts: "typescript",
      json: "json",
      html: "html",
      css: "css",
      md: "markdown",
      txt: "text",
    };

    Display.code(content, languageMap[ext] || "text");

    return { success: true, filename, content, size: content.length };
  }

  /**
   * Handle execute code action
   */
  private async handleExecuteCode(filename: string): Promise<any> {
    // Read file
    const code = this.vfs.readFile(filename);

    // Validate code
    const validation = this.executor.validateCode(code);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    // Get file extension
    const ext = filename.match(/\.[^.]+$/)?.[0] || ".js";

    // Execute
    Display.info(`Executing ${filename}...`);
    const result = await this.executor.execute(code, ext);

    // Store result in memory
    const resultText = result.success
      ? result.output || "Success"
      : result.error || "Unknown error";
    this.memory.setLastExecutionResult(resultText);

    // Display result
    Display.executionResult(resultText, result.success, result.executionTime);

    // If failed, suggest recovery
    if (!result.success) {
      Display.warning(
        "Code execution failed! You can:\n" +
          "  1. Ask me to fix the error\n" +
          "  2. Modify the code manually with another request\n" +
          "  3. Try a different approach"
      );
    }

    return result;
  }

  /**
   * Handle list files action
   */
  private async handleListFiles(): Promise<any> {
    const tree = this.fileManager.displayFileTree();
    console.log(tree);

    const files = this.vfs.listFiles().filter((f) => !f.isDirectory);
    return {
      success: true,
      fileCount: files.length,
      files: files.map((f) => f.path),
    };
  }

  /**
   * Handle delete file action
   */
  private async handleDeleteFile(filename: string): Promise<any> {
    this.vfs.deleteFile(filename);
    Display.success(`File deleted: ${filename}`);

    return { success: true, filename };
  }

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
   * Get current project name
   */
  getProjectName(): string {
    return this.projectName;
  }

  /**
   * Set project name
   */
  setProjectName(name: string): void {
    // Sanitize project name (remove special chars)
    this.projectName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  /**
   * Handle create project action
   */
  private async handleCreateProject(projectName: string): Promise<any> {
    const sanitized = projectName.replace(/[^a-zA-Z0-9_-]/g, "_");

    // Save current project if it has files
    const currentFiles = this.vfs.listFiles().filter((f) => !f.isDirectory);
    if (currentFiles.length > 0) {
      await this.saveCurrentProject();
    }

    // Reset filesystem and create new project
    this.vfs.reset();
    this.setProjectName(sanitized);

    Display.success(`📦 Created new project: ${sanitized}`);

    return { success: true, projectName: sanitized };
  }

  /**
   * Handle switch project action
   */
  private async handleSwitchProject(projectName: string): Promise<any> {
    const sanitized = projectName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const workspaceDir = join(process.cwd(), "workspace");
    const projectDir = join(workspaceDir, sanitized);

    // Check if project exists
    if (!existsSync(projectDir)) {
      Display.error(
        `Project "${sanitized}" not found. Creating new project instead...`
      );
      return await this.handleCreateProject(sanitized);
    }

    // Save current project if it has files
    const currentFiles = this.vfs.listFiles().filter((f) => !f.isDirectory);
    if (currentFiles.length > 0) {
      await this.saveCurrentProject();
    }

    // Load project
    this.vfs.reset();
    const fileCount = this.loadProjectFromDisk(projectDir);
    this.setProjectName(sanitized);

    Display.success(
      `🔄 Switched to project: ${sanitized} (${fileCount} files)`
    );

    return { success: true, projectName: sanitized, fileCount };
  }

  /**
   * Handle list projects action
   */
  private async handleListProjects(): Promise<any> {
    const workspaceDir = join(process.cwd(), "workspace");

    if (!existsSync(workspaceDir)) {
      Display.info("No projects found. Workspace folder doesn't exist yet.");
      return { success: true, projects: [], currentProject: this.projectName };
    }

    const projects = readdirSync(workspaceDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    if (projects.length === 0) {
      Display.info("No projects found in workspace.");
      return { success: true, projects: [], currentProject: this.projectName };
    }

    console.log(chalk.cyan("\n📋 Available Projects:\n"));
    projects.forEach((project) => {
      const isCurrent = project === this.projectName;
      const icon = isCurrent ? "👉" : "  ";
      const color = isCurrent ? chalk.bold.green : chalk.white;
      console.log(`${icon} ${color(project)}`);
    });
    console.log();

    return { success: true, projects, currentProject: this.projectName };
  }

  /**
   * Save current project to disk
   */
  private async saveCurrentProject(): Promise<void> {
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
   * Load project from disk
   */
  private loadProjectFromDisk(projectDir: string): number {
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
   * Handle send message action
   */
  private async handleSendMessage(message: string): Promise<any> {
    // Display the agent's message (avec style!)
    console.log("\n" + chalk.green("🤖 Agent: ") + chalk.white(message) + "\n");

    return { success: true, message };
  }

  /**
   * Handle add todo action
   */
  private async handleAddTodo(task: string): Promise<any> {
    this.todoManager.addTodo(task);
    const stats = this.todoManager.getStats();

    return {
      success: true,
      task,
      stats,
    };
  }

  /**
   * Handle complete todo action
   */
  private async handleCompleteTodo(task: string): Promise<any> {
    const found = this.todoManager.completeTodo(task);

    if (!found) {
      return {
        success: false,
        error: `Task not found: ${task}`,
      };
    }

    const stats = this.todoManager.getStats();

    return {
      success: true,
      task,
      stats,
    };
  }

  /**
   * Handle list todos action
   */
  private async handleListTodos(): Promise<any> {
    const todos = this.todoManager.listTodos();
    const stats = this.todoManager.getStats();

    // Display todos in terminal
    console.log(this.todoManager.displayTodos());

    return {
      success: true,
      todos,
      stats,
    };
  }

  /**
   * Handle clear todos action
   */
  private async handleClearTodos(): Promise<any> {
    const count = this.todoManager.getStats().total;
    this.todoManager.clearTodos();

    return {
      success: true,
      cleared: count,
    };
  }

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

      const sessionData: SessionData = {
        projectName: this.projectName,
        files,
        messages,
        todos,
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
