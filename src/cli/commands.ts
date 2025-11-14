// src/cli/commands.ts
/**
 * Commandes spéciales pour le CLI
 * Parce que parfois tu veux juste reset et recommencer ta vie 🔄
 */

import chalk from 'chalk';
import { Display } from './display.js';
import { ModelSelector } from './model-selector.js';
import type { VirtualFileSystem } from '../filesystem/virtual-fs.js';
import type { FileManager } from '../filesystem/file-manager.js';
import type { AgentMemory } from '../core/memory.js';
import type { OpenRouterClient } from '../llm/openrouter.js';
import type { Agent } from '../core/agent.js';
import type { StorageManager } from '../storage/storage-manager.js';
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

export class CommandHandler {
  private storageManager?: StorageManager;
  private modelSelector: ModelSelector;

  constructor(
    private agent: Agent,
    private vfs: VirtualFileSystem,
    private fileManager: FileManager,
    private memory: AgentMemory,
    private llmClient: OpenRouterClient,
    storageManager?: StorageManager
  ) {
    this.storageManager = storageManager;
    this.modelSelector = new ModelSelector();
  }

  /**
   * Check si c'est une commande spéciale
   */
  isCommand(input: string): boolean {
    return input.startsWith('/');
  }

  /**
   * Execute une commande
   */
  async execute(command: string): Promise<boolean> {
    const [cmd, ...args] = command.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
        this.showHelp();
        return true;

      case 'clear':
        Display.clear();
        return true;

      case 'reset':
        this.reset();
        return true;

      case 'files':
      case 'ls':
        this.listFiles();
        return true;

      case 'cat':
      case 'read':
        if (args.length > 0) {
          this.readFile(args[0]);
        } else {
          Display.error('Usage: /cat <filename>');
        }
        return true;

      case 'delete':
      case 'rm':
        if (args.length > 0) {
          this.deleteFile(args[0]);
        } else {
          Display.error('Usage: /delete <filename>');
        }
        return true;

      case 'stats':
        this.showStats();
        return true;

      case 'export':
        this.exportMemory(args[0]);
        return true;

      case 'sessions':
        await this.showSessions();
        return true;

      case 'model':
        await this.changeModel();
        return true;

      case 'todo':
      case 'todos':
        this.showTodos();
        return true;

      case 'exit':
      case 'quit':
        this.exit();
        return false; // Signal to quit

      default:
        Display.error(
          `Unknown command: /${cmd}\n` +
          `Type /help for available commands. ` +
          `(T'as inventé une commande qui existe pas 🤡)`
        );
        return true;
    }
  }

  /**
   * Show help
   */
  private showHelp(): void {
    const commands = [
      ['help', 'Show this help message'],
      ['clear', 'Clear the screen'],
      ['reset', 'Reset filesystem and memory'],
      ['files, ls', 'List all files in virtual filesystem'],
      ['cat <file>', 'Read and display a file'],
      ['delete <file>', 'Delete a file'],
      ['project [name]', 'Show or set current project name'],
      ['save [name]', 'Save project to workspace/ folder'],
      ['load <name>', 'Load project from workspace/ folder'],
      ['model', 'Change LLM model and reasoning settings'],
      ['todo, todos', 'Show current todo list'],
      ['stats', 'Show detailed agent statistics'],
      ['sessions', 'List all saved sessions (storage)'],
      ['export [path]', 'Export conversation memory to JSON'],
      ['exit, quit', 'Exit the agent'],
    ];

    console.log(chalk.bold.cyan('\n📚 Available Commands:\n'));

    for (const [cmd, desc] of commands) {
      console.log(chalk.yellow(`  /${cmd.padEnd(20)}`) + chalk.gray(desc));
    }

    console.log();
    console.log(chalk.bold.cyan('📝 Supported File Types:\n'));
    console.log(chalk.gray('  JavaScript (.js), TypeScript (.ts), JSON (.json)'));
    console.log(chalk.gray('  HTML (.html), CSS (.css), Markdown (.md), Text (.txt)'));
    console.log();
    console.log(chalk.bold.cyan('💡 Usage Tips:\n'));
    console.log(chalk.gray('  • Ask the agent to create, edit, or execute files'));
    console.log(chalk.gray('  • Type naturally - no special syntax needed'));
    console.log(chalk.gray('  • Use /stats to monitor token usage and costs'));
    console.log(chalk.gray('  • Use /save to backup your work'));
    console.log();
  }

  /**
   * Reset everything
   */
  private reset(): void {
    Display.warning('Resetting filesystem and memory...');
    this.vfs.reset();
    this.memory.reset();
    this.llmClient.resetStats();
    this.agent.getTodoManager().clearTodos();
    Display.success('Everything reset! Fresh start! 🔄');
  }

  /**
   * List files
   */
  private listFiles(): void {
    console.log(this.fileManager.displayFileTree());
  }

  /**
   * Read a file
   */
  private readFile(filename: string): void {
    try {
      const content = this.vfs.readFile(filename);
      const ext = filename.split('.').pop() || 'txt';
      const languageMap: Record<string, string> = {
        'js': 'javascript',
        'ts': 'typescript',
        'json': 'json',
        'txt': 'text',
        'md': 'markdown',
      };

      Display.code(content, languageMap[ext] || 'text');
    } catch (error) {
      Display.error((error as Error).message);
    }
  }

  /**
   * Delete a file
   */
  private deleteFile(filename: string): void {
    try {
      this.vfs.deleteFile(filename);
      Display.success(`Deleted: ${filename} 🗑️`);
    } catch (error) {
      Display.error((error as Error).message);
    }
  }

  /**
   * Save project to workspace folder (real files! 🎉)
   */
  private saveToWorkspace(customName?: string): void {
    try {
      const projectName = customName || this.agent.getProjectName();
      const workspaceDir = join(process.cwd(), 'workspace');
      const projectDir = join(workspaceDir, projectName);

      // Create workspace/ if doesn't exist
      if (!existsSync(workspaceDir)) {
        mkdirSync(workspaceDir, { recursive: true });
      }

      // Create project directory
      if (!existsSync(projectDir)) {
        mkdirSync(projectDir, { recursive: true });
      }

      // Get all files from virtual filesystem
      const files = this.vfs.listFiles();
      const fileCount = files.filter(f => !f.isDirectory).length;

      if (fileCount === 0) {
        Display.warning('No files to save! Create some files first.');
        return;
      }

      // Write each file to disk
      for (const file of files) {
        if (!file.isDirectory) {
          const content = this.vfs.readFile(file.path);
          const filePath = join(projectDir, file.path);

          // Create subdirectories if needed
          const fileDir = join(projectDir, file.path.substring(0, file.path.lastIndexOf('/') || 0));
          if (fileDir !== projectDir && !existsSync(fileDir)) {
            mkdirSync(fileDir, { recursive: true });
          }

          writeFileSync(filePath, content, 'utf8');
        }
      }

      Display.success(
        `💾 Project saved to: workspace/${projectName}/\n` +
        `   ${fileCount} file(s) exported`
      );

      console.log(chalk.gray(`\n   Full path: ${projectDir}`));
    } catch (error) {
      Display.error(`Failed to save: ${(error as Error).message}`);
    }
  }

  /**
   * Load project from workspace folder
   */
  private loadFromWorkspace(projectName: string): void {
    try {
      const workspaceDir = join(process.cwd(), 'workspace');
      const projectDir = join(workspaceDir, projectName);

      if (!existsSync(projectDir)) {
        Display.error(`Project not found: ${projectName}\nAvailable projects: ${this.listWorkspaceProjects().join(', ') || 'none'}`);
        return;
      }

      // Reset current filesystem
      this.vfs.reset();

      // Load all files from project directory
      const loadFiles = (dir: string, basePath: string = '') => {
        const entries = readdirSync(dir, { withFileTypes: true });
        let count = 0;

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            count += loadFiles(fullPath, relativePath);
          } else {
            const content = readFileSync(fullPath, 'utf8');
            this.vfs.writeFile(relativePath, content);
            count++;
          }
        }

        return count;
      };

      const fileCount = loadFiles(projectDir);

      // Update agent project name
      this.agent.setProjectName(projectName);

      Display.success(
        `📥 Project loaded: ${projectName}\n` +
        `   ${fileCount} file(s) imported`
      );
    } catch (error) {
      Display.error(`Failed to load: ${(error as Error).message}`);
    }
  }

  /**
   * List available projects in workspace
   */
  private listWorkspaceProjects(): string[] {
    try {
      const workspaceDir = join(process.cwd(), 'workspace');

      if (!existsSync(workspaceDir)) {
        return [];
      }

      return readdirSync(workspaceDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }

  /**
   * Show current project name
   */
  private showProjectName(): void {
    const name = this.agent.getProjectName();
    console.log(chalk.cyan(`\n📦 Current project: ${chalk.bold(name)}`));
    console.log(chalk.gray(`   Use /project <name> to change\n`));
  }

  /**
   * Set project name
   */
  private setProjectName(name: string): void {
    this.agent.setProjectName(name);
    Display.success(`Project renamed to: ${this.agent.getProjectName()} 📝`);
  }

  /**
   * Show stats
   */
  private showStats(): void {
    const fsStats = this.vfs.getStats();
    const llmStats = this.llmClient.getStats();
    const memoryContext = this.memory.getContext();

    Display.divider();
    console.log(chalk.bold.cyan('📊 Agent Statistics\n'));

    console.log(chalk.yellow('Filesystem:'));
    Display.table({
      'Files': fsStats.fileCount,
      'Size': `${(fsStats.totalSize / 1024).toFixed(2)} KB`,
      'Max Size': `${(fsStats.maxSize / 1024 / 1024).toFixed(0)} MB`,
      'Usage': `${((fsStats.totalSize / fsStats.maxSize) * 100).toFixed(1)}%`,
    });

    console.log(chalk.yellow('LLM Usage:'));
    Display.table({
      'Requests': llmStats.requests,
      'Total Tokens': llmStats.tokens.toLocaleString(),
      'Reasoning Tokens': llmStats.reasoningTokens.toLocaleString(),
      'Cached Tokens': llmStats.cachedTokens.toLocaleString() + ' ⚡',
      'Actual Cost': `$${llmStats.actualCost.toFixed(6)}` + (llmStats.actualCost === 0 ? ' 🎉' : ''),
    });

    console.log(chalk.yellow('Memory:'));
    Display.table({
      'Messages': memoryContext.messages.length,
      'Files Created': memoryContext.filesCreated.length,
      'Tasks': memoryContext.taskHistory.length,
    });

    Display.divider();
  }

  /**
   * Export memory
   */
  private exportMemory(path?: string): void {
    try {
      const json = this.memory.export();
      const filename = path || `memory_${Date.now()}.json`;

      writeFileSync(filename, json, 'utf8');
      Display.success(`Memory exported to: ${filename} 💾`);
    } catch (error) {
      Display.error(`Failed to export memory: ${(error as Error).message}`);
    }
  }

  /**
   * Show saved sessions
   */
  private async showSessions(): Promise<void> {
    const storageManager = this.agent.getStorageManager();

    if (!storageManager) {
      Display.warning('Storage is not enabled. Enable it in .env with STORAGE_ENABLED=true');
      return;
    }

    try {
      const sessions = await storageManager.listSessions();

      if (sessions.length === 0) {
        Display.info('No saved sessions found.');
        return;
      }

      console.log(chalk.cyan('\n📂 Saved Sessions:\n'));

      const sortedSessions = sessions.sort().reverse();
      const currentSessionId = storageManager.getSessionId();

      for (const sessionId of sortedSessions) {
        const isCurrent = sessionId === currentSessionId;
        const icon = isCurrent ? '👉' : '  ';
        const color = isCurrent ? chalk.bold.green : chalk.white;
        console.log(`${icon} ${color(sessionId)}`);
      }

      console.log();
      Display.info(`Current session: ${chalk.bold(currentSessionId)}`);
      console.log();
    } catch (error) {
      Display.error(`Failed to list sessions: ${(error as Error).message}`);
    }
  }

  /**
   * Exit
   */
  private exit(): void {
    const stats = this.llmClient.getStats();

    console.log(chalk.cyan('\n👋 Thanks for using Minimal TS Agent!'));
    console.log(chalk.gray(
      `Session stats: ${stats.requests} requests, ` +
      `${stats.tokens} tokens ` +
      `(${stats.reasoningTokens} reasoning 🧠, ${stats.cachedTokens} cached ⚡), ` +
      `cost: $${stats.actualCost.toFixed(6)}`
    ));

    if (stats.actualCost === 0) {
      console.log(chalk.green('🎉 FREE session! Gotta love open source!\n'));
    } else {
      console.log();
    }

    process.exit(0);
  }

  /**
   * Affiche la todolist de l'agent
   */
  private showTodos(): void {
    const todos = this.agent.getTodoManager().listTodos();

    if (todos.length === 0) {
      console.log(chalk.yellow('\n📝 No todos yet!'));
      console.log(chalk.gray('The agent will create todos as it works on tasks.\n'));
      return;
    }

    console.log(chalk.cyan.bold('\n📝 Current Todo List:\n'));

    todos.forEach((todo, index) => {
      const checkbox = todo.completed ? chalk.green('✓') : chalk.gray('○');
      const taskText = todo.completed
        ? chalk.gray.strikethrough(todo.task)
        : chalk.white(todo.task);

      console.log(`  ${checkbox} ${index + 1}. ${taskText}`);
    });

    const stats = this.agent.getTodoManager().getStats();
    console.log();
    console.log(
      chalk.gray(`Total: ${stats.total} | `) +
      chalk.green(`Completed: ${stats.completed} | `) +
      chalk.yellow(`Pending: ${stats.pending}`)
    );
    console.log();
  }

  /**
   * Change le modèle LLM en pleine session 🔄
   */
  private async changeModel(): Promise<void> {
    console.log(chalk.yellow('\n🔄 Changing model configuration...\n'));

    // Sélection du nouveau modèle
    const currentModel = this.storageManager?.getModelConfig();
    const newSelection = await this.modelSelector.selectModel(currentModel?.modelId);

    // Sauvegarder dans le storage
    if (this.storageManager) {
      await this.storageManager.setModelConfig(
        newSelection.modelId,
        newSelection.reasoningEnabled,
        newSelection.reasoningEffort
      );
      console.log(chalk.green('✓ Model configuration saved!'));
    }

    // Reload model in agent immediately! 🚀
    const reasoning = newSelection.reasoningEnabled ? {
      enabled: true,
      effort: newSelection.reasoningEffort
    } : undefined;

    this.agent.reloadModelConfig(newSelection.modelId, reasoning);

    // Afficher les infos
    this.modelSelector.displayModelInfo(
      newSelection.modelId,
      newSelection.reasoningEnabled,
      newSelection.reasoningEffort
    );

    console.log(
      chalk.green('\n✅ Model change applied immediately!\n') +
      chalk.dim('    Next message will use the new model.')
    );
  }
}
