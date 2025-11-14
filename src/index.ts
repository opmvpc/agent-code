#!/usr/bin/env node
// src/index.ts
/**
 * Entry point - C'est parti! 🚀
 */

import 'dotenv/config';

// FORCE silent OpenAI logs AVANT tout autre import (critique! 🚫)
// Par défaut SILENT, sauf si explicitement DEBUG=verbose
if (process.env.DEBUG !== "verbose") {
  process.env.OPENAI_LOG = "silent";

  // BRUTAL MODE: Override console pour filtrer les logs OpenAI 💀
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalDebug = console.debug;

  const filterOpenAI = (...args: any[]) => {
    const firstArg = String(args[0] || '');
    return firstArg.startsWith('OpenAI:'); // True = filtrer
  };

  console.log = (...args: any[]) => {
    if (filterOpenAI(...args)) return; // SILENCE! 🤫
    originalLog.apply(console, args);
  };

  console.error = (...args: any[]) => {
    if (filterOpenAI(...args)) return;
    originalError.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    if (filterOpenAI(...args)) return;
    originalWarn.apply(console, args);
  };

  console.debug = (...args: any[]) => {
    if (filterOpenAI(...args)) return;
    originalDebug.apply(console, args);
  };
} else {
  process.env.OPENAI_LOG = "debug";
}

import chalk from 'chalk';
import { Agent } from './core/agent.js';
import { ChatInterface } from './cli/chat.js';
import { CommandHandler } from './cli/commands.js';
import { Display } from './cli/display.js';
import { ModelSelector } from './cli/model-selector.js';
import { HomeMenu } from './cli/home-menu.js';
import { ProjectMenu } from './cli/project-menu.js';
import { StorageManager } from './storage/storage-manager.js';
import { UnstorageDriver } from './storage/unstorage-driver.js';
import { ProjectManager } from './workspace/project-manager.js';

/**
 * Validate environment
 */
function validateEnvironment(): { apiKey: string } {
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

  return { apiKey };
}

/**
 * Start chat with a specific project and conversation
 */
async function startChat(
  projectName: string,
  conversationId: string,
  projectManager: ProjectManager,
  storageManager: StorageManager
) {
  const { apiKey } = validateEnvironment();

  // Get model config
  const modelConfig = storageManager.getModelConfig();
  if (!modelConfig) {
    Display.error('No model configured! This should not happen.');
    process.exit(1);
  }

  // Parse reasoning options
  const reasoningOptions: any = {};
  if (modelConfig.reasoningEnabled) {
    reasoningOptions.enabled = true;
    reasoningOptions.effort = modelConfig.reasoningEffort;
  }

  // Create agent with project context
  const agent = new Agent({
    apiKey,
    model: modelConfig.modelId,
    temperature: 1.0,
    debug: process.env.DEBUG === 'true',
    reasoning: Object.keys(reasoningOptions).length > 0 ? reasoningOptions : undefined,
    projectName,
    conversationId,
    projectManager,
  });

  // Create command handler
  const commandHandler = new CommandHandler(
    agent,
    agent.getVFS(),
    agent.getFileManager(),
    agent.getMemory(),
    agent.getLLMClient(),
    storageManager
  );

  // Create chat interface
  const chat = new ChatInterface(agent, commandHandler);

  // Display project/conversation info
  console.log(
    chalk.cyan(`\n📁 Project: ${projectName}`) +
      chalk.gray(` | `) +
      chalk.cyan(`💬 Conversation: ${conversationId}\n`)
  );

  // Start chat loop
  await chat.start();
}

/**
 * Main entry point - New flow with menus!
 */
async function main() {
  try {
    // Validate environment
    validateEnvironment();

    // Initialize storage
    const driver = new UnstorageDriver({
      driver: 'fs',
      base: './.agent-storage',
    });
    const storageManager = new StorageManager(driver);
    await storageManager.loadModelConfig();

    // Initialize project manager
    const projectManager = new ProjectManager('./.agent-storage/projects');

    // Model selection: configure if needed
    const modelSelector = new ModelSelector();
    const savedModel = storageManager.getModelConfig();

    if (!savedModel) {
      // First time - select model
      const modelSelection = await modelSelector.selectModel();
      if (modelSelection) {
        await storageManager.setModelConfig(
          modelSelection.modelId,
          modelSelection.reasoningEnabled,
          modelSelection.reasoningEffort
        );
      } else {
        Display.error('Model selection is required!');
        process.exit(1);
      }
    }

    // Main loop: Home → Project → Chat
    while (true) {
      // 1. Home Menu
      const homeMenu = new HomeMenu(projectManager, modelSelector, storageManager);
      const homeResult = await homeMenu.show();

      if (homeResult.action === 'exit') {
        console.log(chalk.yellow('\n👋 Bye!'));
        process.exit(0);
      }

      if (homeResult.action === 'change-model') {
        // Model changed, back to home
        continue;
      }

      // Get project name (either selected or newly created)
      const projectName =
        homeResult.action === 'create-project'
          ? homeResult.projectName!
          : homeResult.projectName!;

      // 2. Project Menu
      const projectMenu = new ProjectMenu(projectManager, projectName);
      const projectResult = await projectMenu.show();

      if (projectResult.action === 'back') {
        // Back to home
        continue;
      }

      // Get conversation ID (either selected or newly created)
      let conversationId: string;
      if (projectResult.action === 'create-conversation') {
        // New conversation was created
        conversationId = projectResult.conversationId!;
      } else {
        // Existing conversation selected
        conversationId = projectResult.conversationId!;
      }

      // 3. Start chat
      await startChat(projectName, conversationId, projectManager, storageManager);

      // After chat ends (user exited), go back to project menu
      // (ou home menu selon ce qu'on veut)
    }
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
