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
  temperature?: number;
  reasoning?: ReasoningOptions;
  tools?: any[]; // Tool definitions for native tool calling
}

export interface WebSearchOptions {
  maxResults?: number;
  searchPrompt?: string;
  searchContextSize?: "low" | "medium" | "high";
  temperature?: number;
  context?: string;
}

export class OpenRouterClient {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private reasoning?: ReasoningOptions;
  private tools?: any[];
  private requestCount = 0;
  private totalTokens = 0;
  private totalCost = 0;
  private totalReasoningTokens = 0;
  private totalCachedTokens = 0;

  constructor(config: OpenRouterConfig) {
    // Silent mode SAUF si DEBUG=verbose (pour les vrais masochistes 🤡)
    if (process.env.DEBUG !== "verbose") {
      process.env.OPENAI_LOG = "silent";
    } else {
      process.env.OPENAI_LOG = "debug"; // Full spam mode pour les curieux
    }

    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: config.apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/minimal-ts-agent",
        "X-Title": "Minimal TS Agent",
      },
    });

    this.model = config.model;
    this.temperature = config.temperature || 1.0;
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
        temperature: this.temperature,
        // Enable usage accounting pour avoir les vrais coûts! 💰
        usage: {
          include: true,
        },
      };

      // Tools are now in the system prompt (custom JSON format)
      // No native tool calling anymore!

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

      // Parse usage info from OpenRouter (the good stuff 📊)
      this.updateUsageStats(response.usage);

      const duration = Date.now() - startTime;

      if (process.env.DEBUG === "true") {
        const tokens = response.usage?.total_tokens || "?";
        const message = response.choices[0]?.message;
        const hasTools = message?.tool_calls
          ? ` | ${message.tool_calls.length} tool(s)`
          : "";
        console.log(
          chalk.gray(
            `\n[LLM] ${this.model} | ${tokens} tokens${hasTools} | ${duration}ms`
          )
        );
      }

      // Return full response (not just message) for access to choices, usage, etc.
      return response;
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
   * Run a web search request using the OpenRouter web plugin
   * Returns the raw assistant response so the caller can inject it in the loop
   */
  async webSearch(
    query: string,
    options: WebSearchOptions = {}
  ): Promise<any> {
    if (!query?.trim()) {
      throw new Error("query is required for web search");
    }

    const startTime = Date.now();

    try {
      this.requestCount++;

      const requestedMax = Number.isFinite(
        typeof options.maxResults === "number"
          ? options.maxResults
          : Number.NaN
      )
        ? Math.floor(options.maxResults as number)
        : 5;

      const normalizedMaxResults = Math.min(
        Math.max(requestedMax || 5, 1),
        10
      );

      const pluginConfig: any = {
        id: "web",
        max_results: normalizedMaxResults,
      };

      if (options.searchPrompt?.trim()) {
        pluginConfig.search_prompt = options.searchPrompt.trim();
      }

      const systemPrompt =
        "You are a focused research assistant. Use the attached real-time web search results to produce a concise, factual summary. Cite every claim with markdown links named using the domain (e.g. [nytimes.com](https://nytimes.com/...)). If nothing relevant is found, say so.";

      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: options.context
            ? `${options.context.trim()}\n\nSearch query: ${query}`
            : query,
        },
      ];

      const requestBody: any = {
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.2,
        plugins: [pluginConfig],
        usage: {
          include: true,
        },
      };

      if (options.searchContextSize) {
        requestBody.web_search_options = {
          search_context_size: options.searchContextSize,
        };
      }

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

      const response = await this.client.chat.completions.create(requestBody);

      this.updateUsageStats(response.usage);

      if (process.env.DEBUG === "true") {
        const duration = Date.now() - startTime;
        console.log(
          chalk.gray(
            `[WebSearch] ${this.model} | ${normalizedMaxResults} results | ${duration}ms`
          )
        );
      }

      return response;
    } catch (error) {
      if (process.env.DEBUG === "true") {
        console.error(
          chalk.red(
            `[WebSearch] Failed: ${(error as Error).message || "unknown error"}`
          )
        );
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
    messages: ChatCompletionMessageParam[],
    options?: { enableTools?: boolean; temperature?: number }
  ): AsyncGenerator<any> {
    try {
      this.requestCount++;

      const enableTools = options?.enableTools !== false; // Default true
      const temperature = options?.temperature ?? this.temperature;

      // Build request body (same as chat but with stream: true)
      const requestBody: any = {
        model: this.model,
        messages,
        temperature,
        stream: true,
        // Enable usage accounting même en stream
        stream_options: {
          include_usage: true,
        },
      };

      // Tools are now in the system prompt (custom JSON format)
      // No native tool calling in streaming anymore!

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

      // Race entre le stream et le timeout
      const streamIterator = stream[Symbol.asyncIterator]();

      let lastChunkTime = Date.now();
      while (true) {
        // Race entre next chunk et timeout
        const chunkPromise = streamIterator.next();
        const chunk = await Promise.race([
          chunkPromise,
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              const elapsed = Date.now() - lastChunkTime;
              reject(
                new Error(`Stream stall détecté (${elapsed}ms sans chunk)`)
              );
            }, 30000); // 30s entre chunks max
          }),
        ]);

        if (chunk.done) break;
        lastChunkTime = Date.now();

        const chunkValue = chunk.value;
        if (!chunkValue) continue;

        // Check for errors in stream
        if (chunkValue.error) {
          yield { type: "error", error: chunkValue.error };
          break;
        }

        const delta = chunkValue.choices?.[0]?.delta;
        const finishReason = chunkValue.choices?.[0]?.finish_reason;

        // Handle tool calls (they come in multiple chunks)
        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;

            if (!toolCallsMap.has(index)) {
              // New tool call
              const toolCall = {
                id: toolCallDelta.id || "",
                type: "function",
                function: {
                  name: toolCallDelta.function?.name || "",
                  arguments: toolCallDelta.function?.arguments || "",
                },
              };
              toolCallsMap.set(index, toolCall);

              // Log quand on démarre un nouveau tool call
              if (process.env.DEBUG === "verbose") {
                console.log(
                  `[Stream] New tool call at index ${index}: ${
                    toolCall.function.name || "starting..."
                  }`
                );
              }
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
        if ((chunkValue as any).reasoning_content) {
          yield {
            type: "thinking",
            content: (chunkValue as any).reasoning_content,
          };
        }

        // Handle finish
        if (finishReason) {
          // Convert accumulated tool calls to array
          const toolCalls = Array.from(toolCallsMap.values());

          // Log combien de tool calls on a accumulé
          if (process.env.DEBUG === "verbose" && toolCalls.length > 0) {
            console.log(
              `[Stream] Finish! Accumulated ${toolCalls.length} tool call(s):`
            );
            toolCalls.forEach((tc, i) => {
              console.log(
                `  [${i}] ${tc.function.name} (args: ${tc.function.arguments.length} chars)`
              );
            });
          }

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
        if (chunkValue.usage) {
          this.updateUsageStats(chunkValue.usage);
          this.totalTokens += chunkValue.usage.total_tokens || 0;
          yield { type: "usage", usage: chunkValue.usage };
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
   * Get current model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Get reasoning config
   */
  getReasoningConfig(): ReasoningOptions | undefined {
    return this.reasoning;
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
