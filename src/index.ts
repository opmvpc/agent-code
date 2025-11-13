#!/usr/bin/env node
// src/index.ts
/**
 * Entry point - C'est parti! 🚀
 */

import 'dotenv/config';
import chalk from 'chalk';
import { Agent } from './core/agent.js';
import { ChatInterface } from './cli/chat.js';
import { CommandHandler } from './cli/commands.js';
import { Display } from './cli/display.js';

/**
 * Validate environment
 */
function validateEnvironment(): { apiKey: string; model: string } {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    Display.error(
      'OPENROUTER_API_KEY not found in environment!\n\n' +
      'Setup instructions:\n' +
      '1. Copy .env.example to .env\n' +
      '2. Get an API key from https://openrouter.ai/keys\n' +
      '3. Add it to your .env file\n\n' +
      'T\'as vraiment pensé que ça allait marcher sans clé API? 🤡'
    );
    process.exit(1);
  }

  const model = process.env.DEFAULT_MODEL || 'anthropic/claude-3.5-sonnet';

  return { apiKey, model };
}

/**
 * Main entry point
 */
async function main() {
  try {
    // Validate environment
    const { apiKey, model } = validateEnvironment();

    // Parse reasoning options
    const reasoningOptions: any = {};
    if (process.env.REASONING_ENABLED === 'true') {
      reasoningOptions.enabled = true;

      if (process.env.REASONING_EFFORT) {
        reasoningOptions.effort = process.env.REASONING_EFFORT as 'low' | 'medium' | 'high';
      }

      if (process.env.REASONING_EXCLUDE === 'true') {
        reasoningOptions.exclude = true;
      }
    }

    // Create agent
    const agent = new Agent({
      apiKey,
      model,
      maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
      temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      debug: process.env.DEBUG === 'true',
      reasoning: Object.keys(reasoningOptions).length > 0 ? reasoningOptions : undefined,
    });

    // Create command handler
    const commandHandler = new CommandHandler(
      agent,
      agent.getVFS(),
      agent.getFileManager(),
      agent.getMemory(),
      agent.getLLMClient()
    );

    // Create chat interface
    const chat = new ChatInterface(agent, commandHandler);

    // Start chat loop
    await chat.start();

  } catch (error) {
    Display.error(
      `Fatal error: ${(error as Error).message}\n\n` +
      `Stack trace:\n${(error as Error).stack}`
    );
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (error: Error) => {
  console.error(chalk.red('\n💥 Unhandled rejection:'), error);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error(chalk.red('\n💥 Uncaught exception:'), error);
  process.exit(1);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Interrupted. Bye!'));
  process.exit(0);
});

// Run main
main();
