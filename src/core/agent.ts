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
import { ResponseParser, type AgentResponse } from "../llm/parser.js";
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

export interface AgentConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  debug?: boolean;
  reasoning?: ReasoningOptions;
}

export class Agent {
  private memory: AgentMemory;
  private vfs: VirtualFileSystem;
  private fileManager: FileManager;
  private executor: CodeExecutor;
  private llmClient: OpenRouterClient;
  private parser: ResponseParser;
  private projectName: string;

  constructor(config: AgentConfig) {
    // Initialize components
    this.memory = new AgentMemory(10);
    this.vfs = new VirtualFileSystem();
    this.fileManager = new FileManager(this.vfs);
    this.executor = new CodeExecutor();
    this.parser = new ResponseParser();

    // Generate project name (timestamp-based)
    this.projectName = `project_${Date.now()}`;

    this.llmClient = new OpenRouterClient({
      apiKey: config.apiKey,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      reasoning: config.reasoning,
    });

    // Add system prompt to memory
    this.memory.addMessage("system", SYSTEM_PROMPT);
  }

  /**
   * Process user request
   */
  async processRequest(userMessage: string): Promise<AgentResponse> {
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
    const messages = this.memory.getMessages();
    if (contextPrompt) {
      messages.push({
        role: "system",
        content: contextPrompt,
      });
    }

    // Get response from LLM with retry
    let rawResponse: string;
    try {
      rawResponse = await this.llmClient.chatWithRetry(messages);
    } catch (error) {
      throw new Error(
        `Failed to get LLM response: ${(error as Error).message}`
      );
    }

    // Parse response
    const response = this.parser.parse(rawResponse);

    // Add assistant response to memory
    this.memory.addMessage("assistant", response.message);

    // Execute actions if any
    if (response.actions && response.actions.length > 0) {
      await this.executeActions(response);
    }

    return response;
  }

  /**
   * Execute actions from agent response
   */
  private async executeActions(response: AgentResponse): Promise<void> {
    if (!response.actions) return;

    for (const action of response.actions) {
      // Validate action
      const validation = this.parser.validateAction(action);
      if (!validation.valid) {
        Display.error(`Invalid action: ${validation.error}`);
        continue;
      }

      // Display action
      Display.action(this.parser.formatAction(action));

      try {
        switch (action.type) {
          case "write_file":
            await this.handleWriteFile(action.filename!, action.content!);
            break;

          case "read_file":
            await this.handleReadFile(action.filename!);
            break;

          case "execute_code":
            await this.handleExecuteCode(action.filename!);
            break;

          case "list_files":
            await this.handleListFiles();
            break;

          case "delete_file":
            await this.handleDeleteFile(action.filename!);
            break;

          case "create_project":
            await this.handleCreateProject(action.projectName!);
            break;

          case "switch_project":
            await this.handleSwitchProject(action.projectName!);
            break;

          case "list_projects":
            await this.handleListProjects();
            break;
        }
      } catch (error) {
        Display.error(`Action failed: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Handle write file action
   */
  private async handleWriteFile(
    filename: string,
    content: string
  ): Promise<void> {
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
  }

  /**
   * Handle read file action
   */
  private async handleReadFile(filename: string): Promise<void> {
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
  }

  /**
   * Handle execute code action
   */
  private async handleExecuteCode(filename: string): Promise<void> {
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
  }

  /**
   * Handle list files action
   */
  private async handleListFiles(): Promise<void> {
    const tree = this.fileManager.displayFileTree();
    console.log(tree);
  }

  /**
   * Handle delete file action
   */
  private async handleDeleteFile(filename: string): Promise<void> {
    this.vfs.deleteFile(filename);
    Display.success(`File deleted: ${filename}`);
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
  private async handleCreateProject(projectName: string): Promise<void> {
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
  }

  /**
   * Handle switch project action
   */
  private async handleSwitchProject(projectName: string): Promise<void> {
    const sanitized = projectName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const workspaceDir = join(process.cwd(), "workspace");
    const projectDir = join(workspaceDir, sanitized);

    // Check if project exists
    if (!existsSync(projectDir)) {
      Display.error(
        `Project "${sanitized}" not found. Creating new project instead...`
      );
      await this.handleCreateProject(sanitized);
      return;
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
  }

  /**
   * Handle list projects action
   */
  private async handleListProjects(): Promise<void> {
    const workspaceDir = join(process.cwd(), "workspace");

    if (!existsSync(workspaceDir)) {
      Display.info("No projects found. Workspace folder doesn't exist yet.");
      return;
    }

    const projects = readdirSync(workspaceDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    if (projects.length === 0) {
      Display.info("No projects found in workspace.");
      return;
    }

    console.log(chalk.cyan("\n📋 Available Projects:\n"));
    projects.forEach((project) => {
      const isCurrent = project === this.projectName;
      const icon = isCurrent ? "👉" : "  ";
      const color = isCurrent ? chalk.bold.green : chalk.white;
      console.log(`${icon} ${color(project)}`);
    });
    console.log();
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
}
