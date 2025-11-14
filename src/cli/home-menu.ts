// src/cli/home-menu.ts
/**
 * Menu principal - Gestion des projets
 */

import inquirer from "inquirer";
import chalk from "chalk";
import boxen from "boxen";
import { ProjectManager } from "../workspace/project-manager.js";
import { ModelSelector } from "./model-selector.js";
import type { StorageManager } from "../storage/storage-manager.js";

export interface HomeMenuResult {
  action: "select-project" | "create-project" | "change-model" | "exit";
  projectName?: string;
  modelConfig?: { model: string; reasoning?: string };
}

export class HomeMenu {
  constructor(
    private projectManager: ProjectManager,
    private modelSelector: ModelSelector,
    private storageManager: StorageManager
  ) {}

  /**
   * Affiche le menu principal
   */
  async show(): Promise<HomeMenuResult> {
    console.clear();

    // Header
    const header = boxen(
      chalk.bold.cyan("🤖 TYPESCRIPT AGENT") +
        "\n" +
        chalk.gray("Minimal AI Coding Assistant"),
      {
        padding: 1,
        margin: 1,
        borderStyle: "double",
        borderColor: "cyan",
      }
    );
    console.log(header);

    // Model info
    const modelConfig = this.storageManager.getModelConfig();
    const modelDisplay = modelConfig
      ? `${modelConfig.modelId} ${modelConfig.reasoningEnabled ? `(${modelConfig.reasoningEffort})` : ""}`
      : "Not configured";
    console.log(chalk.dim(`  Current model: ${modelDisplay}\n`));

    // Projects list
    const projects = this.projectManager.listProjects();
    if (projects.length > 0) {
      console.log(chalk.bold("  📂 Projects:\n"));
      projects.forEach((project, index) => {
        const convText =
          project.conversationsCount === 1
            ? "1 conversation"
            : `${project.conversationsCount} conversations`;
        console.log(
          chalk.cyan(`    ${index + 1}.`) +
            ` ${project.name} ` +
            chalk.gray(`(${convText})`)
        );
      });
      console.log();
    } else {
      console.log(chalk.gray("  No projects yet. Create one to get started!\n"));
    }

    // Menu choices
    const choices = [];

    if (projects.length > 0) {
      choices.push({
        name: "📂 Open project",
        value: "select-project",
      });
    }

    choices.push(
      {
        name: "➕ Create new project",
        value: "create-project",
      },
      {
        name: "🤖 Change model",
        value: "change-model",
      },
      new inquirer.Separator(),
      {
        name: "🚪 Exit",
        value: "exit",
      }
    );

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices,
      },
    ]);

    // Handle action
    switch (action) {
      case "select-project":
        return this.selectProject(projects);

      case "create-project":
        return this.createProject();

      case "change-model":
        return this.changeModel();

      case "exit":
        return { action: "exit" };

      default:
        return { action: "exit" };
    }
  }

  /**
   * Sélectionne un projet existant
   */
  private async selectProject(
    projects: any[]
  ): Promise<HomeMenuResult> {
    const { projectName } = await inquirer.prompt([
      {
        type: "list",
        name: "projectName",
        message: "Select a project:",
        choices: [
          ...projects.map((p) => ({
            name: `${p.name} (${p.conversationsCount} conversations)`,
            value: p.name,
          })),
          new inquirer.Separator(),
          {
            name: "← Back",
            value: "__back__",
          },
        ],
      },
    ]);

    if (projectName === "__back__") {
      return this.show();
    }

    return {
      action: "select-project",
      projectName,
    };
  }

  /**
   * Crée un nouveau projet
   */
  private async createProject(): Promise<HomeMenuResult> {
    const { projectName } = await inquirer.prompt([
      {
        type: "input",
        name: "projectName",
        message: "Project name:",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Project name cannot be empty";
          }
          if (input.length < 3) {
            return "Project name must be at least 3 characters";
          }
          return true;
        },
      },
    ]);

    if (!projectName) {
      return this.show();
    }

    try {
      // Créer le projet
      const modelConfig = this.storageManager.getModelConfig();
      this.projectManager.createProject(
        projectName.trim(),
        modelConfig?.modelId
      );

      console.log(
        chalk.green(`\n✅ Project "${projectName}" created successfully!\n`)
      );

      return {
        action: "create-project",
        projectName: projectName.trim(),
      };
    } catch (error) {
      console.log(chalk.red(`\n❌ ${(error as Error).message}\n`));
      await inquirer.prompt([
        {
          type: "input",
          name: "continue",
          message: "Press Enter to continue...",
        },
      ]);
      return this.show();
    }
  }

  /**
   * Change le modèle LLM
   */
  private async changeModel(): Promise<HomeMenuResult> {
    const modelConfig = await this.modelSelector.selectModel();

    if (modelConfig) {
      await this.storageManager.setModelConfig(
        modelConfig.modelId,
        modelConfig.reasoningEnabled,
        modelConfig.reasoningEffort
      );
      console.log(
        chalk.green(
          `\n✅ Model changed to: ${modelConfig.modelId} ${modelConfig.reasoningEnabled ? `(${modelConfig.reasoningEffort})` : ""}\n`
        )
      );
    }

    await inquirer.prompt([
      {
        type: "input",
        name: "continue",
        message: "Press Enter to continue...",
      },
    ]);

    return this.show();
  }
}
