// src/llm/openrouter.ts
/**
 * OpenRouter client
 * Parce que payer OpenAI c'est pour les riches 💸
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import chalk from "chalk";

export interface ReasoningOptions {
  enabled?: boolean;
  effort?: "low" | "medium" | "high";
  exclude?: boolean;
}

export interface UsageDetails {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
  cost: number;
  upstreamCost?: number;
}

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  reasoning?: ReasoningOptions;
  tools?: any[]; // Tool definitions for native tool calling
}

export class OpenRouterClient {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private reasoning?: ReasoningOptions;
  private tools?: any[];
  private requestCount = 0;
  private totalTokens = 0;
  private totalCost = 0;
  private totalReasoningTokens = 0;
  private totalCachedTokens = 0;

  constructor(config: OpenRouterConfig) {
    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: config.apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/minimal-ts-agent",
        "X-Title": "Minimal TS Agent",
      },
    });

    this.model = config.model;
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.7;
    this.reasoning = config.reasoning;
    this.tools = config.tools;
  }

  /**
   * Envoie une requête au LLM (retourne le message complet maintenant)
   */
  async chat(messages: ChatCompletionMessageParam[]): Promise<any> {
    const startTime = Date.now();

    try {
      this.requestCount++;

      // Build request body
      const requestBody: any = {
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        // Enable usage accounting pour avoir les vrais coûts! 💰
        usage: {
          include: true,
        },
      };

      // Add tools if configured (native tool calling! 🎉)
      if (this.tools && this.tools.length > 0) {
        requestBody.tools = this.tools;
        requestBody.tool_choice = "auto"; // Let model decide when to use tools
      }

      // Add reasoning params if configured (pour les modèles intelligents 🧠)
      if (this.reasoning) {
        const reasoning: any = {};

        if (this.reasoning.effort) {
          reasoning.effort = this.reasoning.effort;
        }
        if (this.reasoning.exclude !== undefined) {
          reasoning.exclude = this.reasoning.exclude;
        }
        if (this.reasoning.enabled !== undefined) {
          reasoning.enabled = this.reasoning.enabled;
        }

        // Only add reasoning if not empty
        if (Object.keys(reasoning).length > 0) {
          requestBody.reasoning = reasoning;
        }
      }

      const response = await this.client.chat.completions.create(requestBody);

      const message = response.choices[0]?.message;

      // Parse usage info from OpenRouter (the good stuff 📊)
      this.updateUsageStats(response.usage);

      const duration = Date.now() - startTime;

      if (process.env.DEBUG === "true") {
        const tokens = response.usage?.total_tokens || "?";
        const hasTools = message?.tool_calls
          ? ` | ${message.tool_calls.length} tool(s)`
          : "";
        console.log(
          chalk.gray(
            `\n[LLM] ${this.model} | ${tokens} tokens${hasTools} | ${duration}ms`
          )
        );
      }

      return message;
    } catch (error) {
      if (error instanceof Error) {
        // Handle rate limits
        if (error.message.includes("rate limit")) {
          throw new Error(
            "Rate limit exceeded! T'abuses un peu là... 🐌\n" +
              "Attends quelques secondes et réessaie."
          );
        }

        // Handle auth errors
        if (
          error.message.includes("401") ||
          error.message.includes("authentication")
        ) {
          throw new Error(
            "API key invalide! T'as copié la bonne clé? 🔑\n" +
              "Check ton .env file."
          );
        }

        throw new Error(`LLM request failed: ${error.message}`);
      }

      throw error;
    }
  }

  /**
   * Retry logic avec exponential backoff
   */
  async chatWithRetry(
    messages: ChatCompletionMessageParam[],
    maxRetries = 3
  ): Promise<any> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.chat(messages);
      } catch (error) {
        lastError = error as Error;

        // Don't retry on auth errors
        if (
          lastError.message.includes("authentication") ||
          lastError.message.includes("401")
        ) {
          throw lastError;
        }

        // Exponential backoff
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(
            chalk.yellow(
              `\n⚠️  Retry ${attempt + 1}/${maxRetries} in ${delay}ms...`
            )
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Stream responses avec tool calls support! 🌊
   * Yield des objets différents selon le type: content, thinking, tool_calls, usage
   */
  async *chatStream(
    messages: ChatCompletionMessageParam[]
  ): AsyncGenerator<any> {
    try {
      this.requestCount++;

      // Build request body (same as chat but with stream: true)
      const requestBody: any = {
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        stream: true,
        // Enable usage accounting même en stream
        stream_options: {
          include_usage: true,
        },
      };

      // Add tools if configured
      if (this.tools && this.tools.length > 0) {
        requestBody.tools = this.tools;
        requestBody.tool_choice = "auto";
      }

      // Add reasoning params if configured
      if (this.reasoning) {
        const reasoning: any = {};

        if (this.reasoning.effort) {
          reasoning.effort = this.reasoning.effort;
        }
        if (this.reasoning.exclude !== undefined) {
          reasoning.exclude = this.reasoning.exclude;
        }
        if (this.reasoning.enabled !== undefined) {
          reasoning.enabled = this.reasoning.enabled;
        }

        if (Object.keys(reasoning).length > 0) {
          requestBody.reasoning = reasoning;
        }
      }

      // Cast to any pour éviter le type error (OpenAI SDK typing issue avec stream)
      const stream: any = await this.client.chat.completions.create(
        requestBody
      );

      // Accumulate tool calls across chunks (they come fragmented)
      const toolCallsMap: Map<number, any> = new Map();
      let contentBuffer = "";

      for await (const chunk of stream) {
        // Check for errors in stream
        if (chunk.error) {
          yield { type: "error", error: chunk.error };
          break;
        }

        const delta = chunk.choices?.[0]?.delta;
        const finishReason = chunk.choices?.[0]?.finish_reason;

        // Handle tool calls (they come in multiple chunks)
        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;

            if (!toolCallsMap.has(index)) {
              // New tool call
              toolCallsMap.set(index, {
                id: toolCallDelta.id || "",
                type: "function",
                function: {
                  name: toolCallDelta.function?.name || "",
                  arguments: toolCallDelta.function?.arguments || "",
                },
              });
            } else {
              // Append to existing tool call
              const existing = toolCallsMap.get(index);
              if (toolCallDelta.id) existing.id = toolCallDelta.id;
              if (toolCallDelta.function?.name) {
                existing.function.name += toolCallDelta.function.name;
              }
              if (toolCallDelta.function?.arguments) {
                existing.function.arguments += toolCallDelta.function.arguments;
              }
            }
          }
        }

        // Handle text content (stream it in real-time!)
        if (delta?.content) {
          contentBuffer += delta.content;
          yield { type: "content", content: delta.content };
        }

        // Handle thinking/reasoning (some models support this)
        if ((chunk as any).reasoning_content) {
          yield { type: "thinking", content: (chunk as any).reasoning_content };
        }

        // Handle finish
        if (finishReason) {
          // Convert accumulated tool calls to array
          const toolCalls = Array.from(toolCallsMap.values());

          if (toolCalls.length > 0) {
            yield {
              type: "tool_calls",
              tool_calls: toolCalls,
              content: contentBuffer || null,
              finish_reason: finishReason,
            };
          } else {
            yield {
              type: "done",
              content: contentBuffer || null,
              finish_reason: finishReason,
            };
          }
        }

        // Handle usage stats (comes at the end)
        if (chunk.usage) {
          this.updateUsageStats(chunk.usage);
          this.totalTokens += chunk.usage.total_tokens || 0;
          yield { type: "usage", usage: chunk.usage };
        }
      }
    } catch (error) {
      yield { type: "error", error: (error as Error).message };
    }
  }

  /**
   * Parse et update usage stats depuis OpenRouter response
   */
  private updateUsageStats(usage: any): void {
    if (!usage) return;

    // Total tokens
    this.totalTokens += usage.total_tokens || 0;

    // Reasoning tokens (si le modèle pense 🧠)
    const reasoningTokens =
      usage.completion_tokens_details?.reasoning_tokens || 0;
    this.totalReasoningTokens += reasoningTokens;

    // Cached tokens (optimization FTW ⚡)
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens || 0;
    this.totalCachedTokens += cachedTokens;

    // Real cost from OpenRouter (enfin des vrais chiffres! 💰)
    // Cost is in credits, need to divide by 100 to get dollars
    const cost = usage.cost ? usage.cost / 100 : 0;
    this.totalCost += cost;

    if (process.env.DEBUG === "true") {
      console.log(
        chalk.gray(
          `[Usage] Tokens: ${usage.total_tokens} | ` +
            `Reasoning: ${reasoningTokens} | ` +
            `Cached: ${cachedTokens} | ` +
            `Cost: $${cost.toFixed(6)}`
        )
      );
    }
  }

  /**
   * Get stats (avec les VRAIES infos maintenant! 📊)
   */
  getStats(): {
    requests: number;
    tokens: number;
    reasoningTokens: number;
    cachedTokens: number;
    actualCost: number;
  } {
    return {
      requests: this.requestCount,
      tokens: this.totalTokens,
      reasoningTokens: this.totalReasoningTokens,
      cachedTokens: this.totalCachedTokens,
      actualCost: this.totalCost,
    };
  }

  /**
   * Reset stats
   */
  resetStats(): void {
    this.requestCount = 0;
    this.totalTokens = 0;
    this.totalCost = 0;
    this.totalReasoningTokens = 0;
    this.totalCachedTokens = 0;
  }

  /**
   * Helper sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
