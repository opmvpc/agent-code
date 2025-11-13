// src/cli/model-selector.ts
/**
 * Menu interactif pour sélectionner le modèle
 * Avec les stats et le thinking! 🎯
 */

import inquirer from "inquirer";
import chalk from "chalk";
import { readFileSync } from "fs";
import { join } from "path";

export interface ModelConfig {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  supportsReasoning: boolean;
}

export interface ModelSelection {
  modelId: string;
  reasoningEnabled: boolean;
  reasoningEffort: "low" | "medium" | "high";
}

export class ModelSelector {
  private models: ModelConfig[] = [];

  constructor() {
    this.loadModels();
  }

  /**
   * Charge les modèles depuis config/models.json
   */
  private loadModels(): void {
    try {
      const configPath = join(process.cwd(), "config", "models.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));

      // Config.models est un ARRAY, pas un object (t'as vu le JSON? 🤡)
      this.models = config.models.map((model: any) => ({
        id: model.id,
        name: model.name || model.id,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        supportsReasoning: model.reasoning?.supported || false,
      }));
    } catch (error) {
      console.error(chalk.red("Failed to load models config:"), (error as Error).message);
      // Fallback sur un modèle par défaut
      this.models = [
        {
          id: "openai/gpt-oss-120b",
          name: "GPT-OSS 120B",
          contextWindow: 131072,
          maxTokens: 4096,
          supportsReasoning: true,
        },
      ];
    }
  }

  /**
   * Affiche le menu et retourne le choix
   */
  async selectModel(defaultModel?: string): Promise<ModelSelection> {
    console.log(chalk.cyan.bold("\n🤖 Model Selection\n"));

    // Formatte les choix avec stats
    const choices = this.models.map((model) => {
      const ctx = `${model.contextWindow / 1000}k`;
      const reasoning = model.supportsReasoning ? chalk.green("⚡ reasoning") : "";
      const label = `${chalk.white(model.name)} ${chalk.gray(`(${ctx} ctx)`)} ${reasoning}`;

      return {
        name: label,
        value: model.id,
      };
    });

    // Trouve l'index du default
    const defaultIndex = defaultModel
      ? this.models.findIndex((m) => m.id === defaultModel)
      : this.models.findIndex((m) => m.id === "openai/gpt-oss-120b");

    const modelAnswer = await inquirer.prompt([
      {
        type: "list",
        name: "modelId",
        message: "Select model:",
        choices,
        default: defaultIndex >= 0 ? defaultIndex : 0,
        pageSize: 15,
      },
    ]);

    const selectedModel = this.models.find((m) => m.id === modelAnswer.modelId)!;

    // Si le modèle supporte reasoning, demander les options
    let reasoningEnabled = false;
    let reasoningEffort: "low" | "medium" | "high" = "high";

    if (selectedModel.supportsReasoning) {
      const reasoningAnswer = await inquirer.prompt([
        {
          type: "confirm",
          name: "enabled",
          message: "Enable reasoning/thinking?",
          default: true,
        },
      ]);

      reasoningEnabled = reasoningAnswer.enabled;

      if (reasoningEnabled) {
        const effortAnswer = await inquirer.prompt([
          {
            type: "list",
            name: "effort",
            message: "Reasoning effort:",
            choices: [
              { name: chalk.green("High") + chalk.gray(" (best quality, slower)"), value: "high" },
              { name: chalk.yellow("Medium") + chalk.gray(" (balanced)"), value: "medium" },
              { name: chalk.blue("Low") + chalk.gray(" (faster, less thinking)"), value: "low" },
            ],
            default: 0, // High par défaut
          },
        ]);

        reasoningEffort = effortAnswer.effort;
      }
    }

    console.log(
      chalk.green("\n✓ Selected:"),
      chalk.white(selectedModel.name),
      reasoningEnabled ? chalk.dim(`(reasoning: ${reasoningEffort})`) : ""
    );
    console.log();

    return {
      modelId: selectedModel.id,
      reasoningEnabled,
      reasoningEffort,
    };
  }

  /**
   * Affiche un résumé du modèle sélectionné
   */
  displayModelInfo(modelId: string, reasoningEnabled: boolean, reasoningEffort?: string): void {
    const model = this.models.find((m) => m.id === modelId);
    if (!model) return;

    console.log(chalk.cyan("📊 Current Model:"));
    console.log(chalk.white(`  ${model.name}`));
    console.log(chalk.gray(`  Context: ${model.contextWindow / 1000}k tokens`));
    if (model.supportsReasoning && reasoningEnabled) {
      console.log(chalk.green(`  ⚡ Reasoning: ${reasoningEffort || "enabled"}`));
    }
    console.log();
  }
}
