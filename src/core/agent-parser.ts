// src/core/agent-parser.ts
/**
 * Parsing logic pour l'agent avec retry system
 */

import { parseJSONResponse, formatErrorForRetry, type ParseResult } from "../llm/json-parser.js";
import type { OpenRouterClient } from "../llm/openrouter.js";
import logger from "../utils/logger.js";
import chalk from "chalk";

const MAX_RETRY_ATTEMPTS = 5;

/**
 * Parse response with automatic retry on error
 */
export async function parseWithRetry(
  initialResponse: string,
  messages: any[],
  llmClient: OpenRouterClient
): Promise<ParseResult> {
  let attempt = 0;
  let currentResponse = initialResponse;

  while (attempt < MAX_RETRY_ATTEMPTS) {
    attempt++;

    // Try to parse
    const result = parseJSONResponse(currentResponse);

    if (result.success) {
      if (attempt > 1) {
        logger.info(`JSON parsed successfully after ${attempt} attempts`);
      }
      return result;
    }

    // If failed and we have retries left
    if (attempt < MAX_RETRY_ATTEMPTS) {
      logger.warn(`Parsing failed, retry ${attempt}/${MAX_RETRY_ATTEMPTS}`, {
        error: result.error,
      });

      // Add error message to conversation
      const errorMessage = formatErrorForRetry(result.error!, attempt, MAX_RETRY_ATTEMPTS);
      messages.push({
        role: "user",
        content: errorMessage,
      });

      // Ask LLM to fix the JSON
      try {
        const retryResponse = await llmClient.chat(messages);

        const retryMessage = retryResponse.choices?.[0]?.message;
        const retryReasoning = retryMessage?.reasoning;

        // Log retry response
        logger.info("Retry API response received", {
          attempt,
          hasChoices: !!retryResponse.choices,
          choicesLength: retryResponse.choices?.length,
          firstChoice: retryResponse.choices?.[0] ? {
            hasMessage: !!retryMessage,
            contentLength: retryMessage?.content?.length,
            hasReasoning: !!retryReasoning,
          } : null,
        });

        currentResponse = retryMessage?.content || "";

        // Log reasoning if present
        if (retryReasoning) {
          logger.info("Retry reasoning trace", {
            attempt,
            reasoning: retryReasoning,
          });

          console.log(chalk.magenta(`\n💭 Reasoning (retry ${attempt}):`));
          console.log(chalk.dim(retryReasoning));
          console.log();
        }

        logger.info("Retry response text", {
          attempt,
          responseText: currentResponse,
          length: currentResponse.length,
        });

        // Add assistant's retry to history
        messages.push({
          role: "assistant",
          content: currentResponse,
        });
      } catch (error) {
        logger.error("Retry LLM call failed", {
          error: (error as Error).message,
          stack: (error as Error).stack,
        });
        return {
          success: false,
          error: `Retry failed: ${(error as Error).message}`,
          retryCount: attempt,
        };
      }
    } else {
      // Max retries reached
      logger.error(`Max retries (${MAX_RETRY_ATTEMPTS}) reached, giving up`);
      return {
        success: false,
        error: `Failed after ${attempt} attempts: ${result.error}`,
        retryCount: attempt,
      };
    }
  }

  return {
    success: false,
    error: "Unexpected: exited retry loop",
    retryCount: attempt,
  };
}
