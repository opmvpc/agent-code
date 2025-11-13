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
import { ModelSelector } from './cli/model-selector.js';
import { StorageManager } from './storage/storage-manager.js';
import { UnstorageDriver } from './storage/unstorage-driver.js';

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
 * Main entry point
 */
async function main() {
  try {
    // Validate environment
    const { apiKey } = validateEnvironment();

    // Initialize storage pour charger les préférences
    let storageManager: StorageManager | undefined;
    if (process.env.STORAGE_ENABLED !== 'false') {
      const driver = new UnstorageDriver({
        driver: (process.env.STORAGE_DRIVER as 'fs' | 'memory') || 'fs',
        base: process.env.STORAGE_BASE_PATH || './.agent-storage',
      });
      storageManager = new StorageManager(driver);

      // Essayer de charger la dernière session pour récupérer la config modèle
      const sessions = await storageManager.listSessions();
      if (sessions.length > 0) {
        const lastSession = sessions.sort().reverse()[0];
        const sessionData = await storageManager.loadSession(lastSession);
        if (sessionData?.modelConfig) {
          storageManager.setModelConfig(
            sessionData.modelConfig.modelId,
            sessionData.modelConfig.reasoningEnabled,
            sessionData.modelConfig.reasoningEffort
          );
        }
      }
    }

    // Model selection interactif!
    const modelSelector = new ModelSelector();
    const savedModel = storageManager?.getModelConfig();

    const modelSelection = await modelSelector.selectModel(savedModel?.modelId);

    // Sauvegarder le choix dans le storage
    if (storageManager) {
      storageManager.setModelConfig(
        modelSelection.modelId,
        modelSelection.reasoningEnabled,
        modelSelection.reasoningEffort
      );
    }

    // Afficher les infos du modèle
    modelSelector.displayModelInfo(
      modelSelection.modelId,
      modelSelection.reasoningEnabled,
      modelSelection.reasoningEffort
    );

    // Parse reasoning options
    const reasoningOptions: any = {};
    if (modelSelection.reasoningEnabled) {
      reasoningOptions.enabled = true;
      reasoningOptions.effort = modelSelection.reasoningEffort;
    }

    // Create agent
    const agent = new Agent({
      apiKey,
      model: modelSelection.modelId,
      maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
      temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      debug: process.env.DEBUG === 'true',
      reasoning: Object.keys(reasoningOptions).length > 0 ? reasoningOptions : undefined,
      storage: {
        enabled: process.env.STORAGE_ENABLED !== 'false',
        driver: (process.env.STORAGE_DRIVER as 'fs' | 'memory') || 'fs',
        basePath: process.env.STORAGE_BASE_PATH || './.agent-storage',
      },
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
