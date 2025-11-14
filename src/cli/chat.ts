// src/cli/chat.ts
/**
 * Interactive CLI chat interface
 * Le truc qui fait que ton agent a l'air vivant 🤖
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { Display } from './display.js';
import { CommandHandler } from './commands.js';
import type { Agent } from '../core/agent.js';

export class ChatInterface {
  private commandHandler: CommandHandler;
  private onTitleGenerated?: (title: string) => void;

  constructor(private agent: Agent, commandHandler: CommandHandler) {
    this.commandHandler = commandHandler;
  }

  /**
   * Set callback for when title is generated
   */
  setOnTitleGenerated(callback: (title: string) => void): void {
    this.onTitleGenerated = callback;
  }

  /**
   * Démarre la boucle de chat
   * Returns true if user wants to exit to project menu
   */
  async start(): Promise<boolean> {
    Display.showBanner();

    // Show welcome message with project info
    Display.info(
      'Ready to code! Ask me to create files, write code, or execute scripts.\n' +
      'Pro tip: I work best with clear instructions! 💡\n' +
      `📦 Project: ${chalk.bold((this.agent as any).getProjectName())} (use /project to rename)`
    );

    // Show example prompts
    this.showExamples();

    // Main chat loop
    while (true) {
      const result = await this.chatLoop();
      if (result === 'exit-to-project-menu') {
        return true; // Exit to project menu
      }
      if (result === 'exit-program') {
        return false; // Exit completely
      }
      // result === 'continue', keep looping
    }

    return false; // Should never reach here
  }

  /**
   * Une itération de la boucle de chat
   * Returns 'continue', 'exit-to-project-menu', or 'exit-program'
   */
  private async chatLoop(): Promise<'continue' | 'exit-to-project-menu' | 'exit-program'> {
    try {
      // Get user input
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: chalk.cyan('You:'),
          prefix: '👤',
        },
      ]);

      const userMessage = answers.message.trim();

      // Check for empty message
      if (!userMessage) {
        return 'continue';
      }

      // Check for commands
      if (this.commandHandler.isCommand(userMessage)) {
        const shouldContinue = await this.commandHandler.execute(userMessage);

        // Check if user wants to exit to project menu
        if (this.commandHandler.getShouldExitToProjectMenu()) {
          this.commandHandler.resetExitFlag();
          return 'exit-to-project-menu';
        }

        if (!shouldContinue) {
          return 'exit-program'; // Complete exit (shouldn't happen with new /exit)
        }

        return 'continue';
      }

      // Process with agent
      Display.divider();

          try {
            const response = await this.agent.processRequest(userMessage);

            // Generate title asynchronously if this was the first message
            if (response.shouldGenerateTitle) {
              if (this.onTitleGenerated) {
                console.log(chalk.gray("\n[Chat] First message detected - will generate title after response"));
                // Don't await - generate title in background
                this.generateTitleAsync();
              } else {
                console.log(chalk.yellow("\n[Chat] Warning: shouldGenerateTitle=true but no callback registered!"));
              }
            }

        // Le message est déjà affiché par le streaming!
        // On affiche juste un divider pour séparer
        console.log(); // Extra line break
        Display.divider();

        // Petit délai pour éviter conflit curseur avec inquirer
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        Display.error((error as Error).message);

        // Suggest recovery
        if ((error as Error).message.includes('API key')) {
          Display.warning(
            'Make sure your .env file has OPENROUTER_API_KEY set!\n' +
            'Get one at: https://openrouter.ai/keys'
          );
        }
      }

      return 'continue';
    } catch (error) {
      // Handle Ctrl+C
      if ((error as Error).message.includes('User force closed')) {
        console.log(chalk.yellow('\n\n👋 Bye!'));
        return 'exit-program';
      }
      throw error;
    }
  }

  /**
   * Generate conversation title asynchronously
   */
  private async generateTitleAsync(): Promise<void> {
    try {
      const { generateConversationTitle } = await import("../llm/title-generator.js");

      const messages = this.agent.getMemory().getMessages()
        .filter(m => m.role !== "system")
        .map(m => ({ role: m.role, content: m.content || "" }));

      if (messages.length < 2) {
        console.log(chalk.gray("[TitleGen] Not enough messages yet (need at least user + assistant)"));
        return; // Need at least user + assistant message
      }

      console.log(chalk.gray("\n[TitleGen] Generating conversation title..."));

      const title = await generateConversationTitle(
        this.agent.getLLMClient(),
        messages
      );

      console.log(chalk.gray(`[TitleGen] Generated title: "${title}"`));

      if (this.onTitleGenerated) {
        this.onTitleGenerated(title);
      } else {
        console.log(chalk.yellow("[TitleGen] Warning: No callback registered!"));
      }
    } catch (error) {
      console.error(chalk.red(`[TitleGen] Failed to generate title: ${(error as Error).message}`));
    }
  }

  /**
   * Show example prompts
   */
  private showExamples(): void {
    const examples = [
      'Create a Fibonacci calculator in TypeScript',
      'Write a function to reverse a string and test it',
      'Make a simple HTML page with CSS styling',
      'Create a todo list data structure with methods',
      'Build a calculator with add, subtract, multiply, divide',
    ];

    console.log(chalk.gray('\n💡 Example prompts:'));
    examples.forEach(ex => {
      console.log(chalk.gray(`   • ${ex}`));
    });
    console.log(chalk.gray('\n💬 Type /help for available commands'));
    console.log();
  }

  /**
   * Stream response character by character (pour le flex 💅)
   */
  private async streamResponse(text: string, delay: number = 20): Promise<void> {
    for (const char of text) {
      process.stdout.write(chalk.green(char));
      await this.sleep(delay);
    }
    console.log();
  }

  /**
   * Helper sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
