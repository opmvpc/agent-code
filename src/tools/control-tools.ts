// src/tools/control-tools.ts
/**
 * Tools pour le contrôle du flow de l'agent (send_message, stop)
 */

import { BaseTool, type ToolResult } from "./base-tool.js";
import type { Agent } from "../core/agent.js";
import {
  getSendMessagePrompt,
  type SendMessageContext,
} from "../llm/send-message-prompt.js";
import chalk from "chalk";

/**
 * Tool pour envoyer un message à l'utilisateur
 * Fait un appel LLM streamé pour générer un message naturel basé sur le contexte
 */
export class SendMessageTool extends BaseTool {
  readonly name = "send_message";
  readonly description =
    "Communicate with the user. This will generate a natural message explaining what you did, showing progress, and suggesting next steps. Call this when you want to update the user.";

  protected getParametersSchema() {
    return {
      properties: {},
      required: [],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    // Préparer le contexte pour send_message
    const context: SendMessageContext = {
      conversation: agent.getMemory().getMessages().slice(-10), // Derniers 10 messages
      todos: agent.getTodoManager().listTodos(),
      lastActions: agent.getLastActions(),
      userRequest:
        agent
          .getMemory()
          .getMessages()
          .filter((m) => m.role === "user")
          .pop()?.content || "",
    };

    // Générer le prompt pour send_message
    const systemPrompt = getSendMessagePrompt(context);

    // Faire un appel LLM streamé SANS tools (juste pour générer du texte!)
    console.log(chalk.cyan("\n💬 Agent:"));
    console.log(); // Nouvelle ligne

    try {
      const llmClient = agent.getLLMClient();

      // Prepare messages for send_message LLM call
      const messages: any[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: "Generate a brief message for the user (2-4 sentences).",
        },
      ];

      // Stream la réponse caractère par caractère! 🌊
      let fullMessage = "";
      const stream = llmClient.chatStream(messages, {
        enableTools: false, // Pas de tools pour send_message!
        temperature: 0.7, // Un peu de créativité
      });

      for await (const chunk of stream) {
        if (chunk.type === "content") {
          process.stdout.write(chalk.white(chunk.content));
          fullMessage += chunk.content;
        } else if (chunk.type === "done") {
          // Finished streaming
          fullMessage = chunk.content || fullMessage;
        }
      }

      console.log(); // Nouvelle ligne
      console.log(); // Espace après

      return {
        success: true,
        message: fullMessage,
        streamed: true,
      };
    } catch (error) {
      console.error(
        chalk.red("Failed to generate message:", (error as Error).message)
      );
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

/**
 * Tool pour signaler la fin du travail
 */
export class StopTool extends BaseTool {
  readonly name = "stop";
  readonly description =
    "Signal that you have completed ALL tasks and are ready to finish. Only call this when everything is done!";

  protected getParametersSchema() {
    return {
      properties: {},
      required: [],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    return {
      success: true,
      action: "stop",
      message: "All tasks completed. Agent has finished.",
    };
  }
}
