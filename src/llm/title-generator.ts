// src/llm/title-generator.ts
/**
 * Génère automatiquement des titres de conversation basés sur le contenu
 */

import type { OpenRouterClient } from "./openrouter.js";
import logger from "../utils/logger.js";

/**
 * Génère un titre de conversation basé sur les messages échangés
 */
export async function generateConversationTitle(
  llmClient: OpenRouterClient,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    // Prend les 3 premiers échanges pour générer un titre pertinent
    const relevantMessages = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(0, 6) // 3 échanges max
      .map((m) => `${m.role}: ${m.content.substring(0, 200)}`)
      .join("\n");

    const prompt = `Based on this conversation excerpt, generate a short, descriptive title (max 50 characters, no quotes, no punctuation at the end):

${relevantMessages}

Title (concise and descriptive):`;

    const response = await llmClient.chat([
      {
        role: "user",
        content: prompt,
      },
    ]);

    const generatedTitle =
      response.choices?.[0]?.message?.content?.trim() || "";

    // Clean up the title
    let title = generatedTitle
      .replace(/^["']|["']$/g, "") // Remove quotes
      .replace(/[.!?]+$/, "") // Remove ending punctuation
      .trim();

    // Limit to 50 chars
    if (title.length > 50) {
      title = title.substring(0, 47) + "...";
    }

    // Fallback if empty
    if (!title || title.length < 3) {
      return "New conversation";
    }

    logger.info("Generated conversation title", {
      title,
      messageCount: messages.length,
    });

    return title;
  } catch (error) {
    logger.error("Failed to generate conversation title", {
      error: (error as Error).message,
    });
    return "New conversation";
  }
}
