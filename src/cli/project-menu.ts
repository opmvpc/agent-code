// src/cli/project-menu.ts
/**
 * Menu de projet - Gestion des conversations
 */

import inquirer from "inquirer";
import chalk from "chalk";
import boxen from "boxen";
import { ProjectManager } from "../workspace/project-manager.js";
import type { Conversation } from "../workspace/types.js";

export interface ProjectMenuResult {
  action: "select-conversation" | "create-conversation" | "back";
  conversationId?: string;
}

export class ProjectMenu {
  constructor(
    private projectManager: ProjectManager,
    private projectName: string
  ) {}

  /**
   * Affiche le menu du projet
   */
  async show(): Promise<ProjectMenuResult> {
    console.clear();

    // Header
    const header = boxen(chalk.bold.cyan(`📁 ${this.projectName}`), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "cyan",
    });
    console.log(header);

    // Conversations list
    const conversations = this.projectManager.listConversations(
      this.projectName
    );

    if (conversations.length > 0) {
      console.log(chalk.bold("  💬 Conversations:\n"));
      conversations.forEach((conv, index) => {
        const timeAgo = this.formatTimeAgo(conv.lastModified);
        const filesText =
          conv.fileCount === 0
            ? "no files"
            : conv.fileCount === 1
              ? "1 file"
              : `${conv.fileCount} files`;
        const msgsText =
          conv.messageCount === 1
            ? "1 message"
            : `${conv.messageCount} messages`;

        // Si pas de nom, utiliser un nom par défaut temporaire
        const displayName = conv.name || `New conversation (${conv.id})`;

        console.log(
          chalk.cyan(`    ${index + 1}.`) +
            ` ${displayName}` +
            "\n" +
            chalk.dim(`       ${msgsText}, ${filesText} • ${timeAgo}`)
        );
      });
      console.log();
    } else {
      console.log(
        chalk.gray("  No conversations yet. Create one to get started!\n")
      );
    }

    // Menu choices
    const choices = [];

    if (conversations.length > 0) {
      choices.push({
        name: "💬 Open conversation",
        value: "select-conversation",
      });
    }

    choices.push(
      {
        name: "➕ New conversation",
        value: "create-conversation",
      },
      new inquirer.Separator(),
      {
        name: "← Back to home",
        value: "back",
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
      case "select-conversation":
        return this.selectConversation(conversations);

      case "create-conversation":
        return this.createConversation();

      case "back":
        return { action: "back" };

      default:
        return { action: "back" };
    }
  }

  /**
   * Sélectionne une conversation existante
   */
  private async selectConversation(
    conversations: Conversation[]
  ): Promise<ProjectMenuResult> {
    const { conversationId } = await inquirer.prompt([
      {
        type: "list",
        name: "conversationId",
        message: "Select a conversation:",
        choices: [
          ...conversations.map((conv) => {
            const timeAgo = this.formatTimeAgo(conv.lastModified);
            const displayName = conv.name || `New conversation (${conv.id})`;
            return {
              name: `${displayName} (${conv.messageCount} messages, ${timeAgo})`,
              value: conv.id,
            };
          }),
          new inquirer.Separator(),
          {
            name: "← Back",
            value: "__back__",
          },
        ],
      },
    ]);

    if (conversationId === "__back__") {
      return this.show();
    }

    return {
      action: "select-conversation",
      conversationId,
    };
  }

  /**
   * Crée une nouvelle conversation
   */
  private async createConversation(): Promise<ProjectMenuResult> {
    const { conversationName } = await inquirer.prompt([
      {
        type: "input",
        name: "conversationName",
        message: "Conversation name (optional):",
      },
    ]);

    try {
      const conv = this.projectManager.createConversation(
        this.projectName,
        conversationName || undefined
      );

      console.log(
        chalk.green(`\n✅ Conversation "${conv.name}" created!\n`)
      );

      return {
        action: "create-conversation",
        conversationId: conv.id,
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
   * Formatte un temps relatif (ex: "2h ago", "30min ago")
   */
  private formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString();
  }
}
