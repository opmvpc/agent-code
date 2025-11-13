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

  constructor(private agent: Agent, commandHandler: CommandHandler) {
    this.commandHandler = commandHandler;
  }

  /**
   * Démarre la boucle de chat
   */
  async start(): Promise<void> {
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
      const shouldContinue = await this.chatLoop();
      if (!shouldContinue) {
        break;
      }
    }
  }

  /**
   * Une itération de la boucle de chat
   */
  private async chatLoop(): Promise<boolean> {
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
        return true;
      }

      // Check for commands
      if (this.commandHandler.isCommand(userMessage)) {
        return await this.commandHandler.execute(userMessage);
      }

      // Process with agent
      Display.divider();

      try {
        const response = await this.agent.processRequest(userMessage);

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

      return true;
    } catch (error) {
      // Handle Ctrl+C
      if ((error as Error).message.includes('User force closed')) {
        console.log(chalk.yellow('\n\n👋 Bye!'));
        return false;
      }
      throw error;
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
