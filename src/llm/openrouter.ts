// src/llm/openrouter.ts
/**
 * OpenRouter client
 * Avec le SDK OFFICIEL maintenant! ðŸ”¥
 */

import { OpenRouter } from "@openrouter/sdk";
// Use simple type for messages to avoid TS resolution issues
import chalk from "chalk";
import logger from "../utils/logger.js";

// Type for messages (compatible with OpenRouter SDK)
export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  // For tool results:
  toolCallId?: string;
};

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
  responseFormat?: {
    type: "json_schema";
    jsonSchema: {
      // camelCase pour le SDK officiel!
      name: string;
      description?: string;
      schema?: any;
      strict?: boolean;
    };
  };
}

export interface WebSearchOptions {
  maxResults?: number;
  searchPrompt?: string;
  searchContextSize?: "low" | "medium" | "high";
  temperature?: number;
  context?: string;
}

export interface ImageGenerationOptions {
  model?: string;
  aspectRatio?: string;
}

export interface ImageGenerationResult {
  dataUrl: string;
  mimeType: string;
}

type AssistantImageAttachment = {
  image_url?: { url: string };
  imageUrl?: { url: string };
  imageURL?: { url: string };
};

type AssistantMessageWithImages = {
  images?: AssistantImageAttachment[];
};

const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image-preview";
const IMAGE_MODEL_FALLBACKS = [
  "google/gemini-2.5-flash-image-preview",
  "openai/gpt-5-image-mini",
];

export class OpenRouterClient {
  private client: OpenRouter;
  private model: string;
  private temperature: number;
  private reasoning?: ReasoningOptions;
  private tools?: any[];
  private responseFormat?: OpenRouterConfig["responseFormat"];
  private requestCount = 0;
  private totalTokens = 0;
  private totalCost = 0;
  private totalReasoningTokens = 0;
  private totalCachedTokens = 0;

  constructor(config: OpenRouterConfig) {
    // Create OpenRouter client (le vrai SDK officiel! ðŸ”¥)
    this.client = new OpenRouter({
      apiKey: config.apiKey,
      serverURL: "https://openrouter.ai/api/v1",
    });

    this.model = config.model;
    this.temperature = config.temperature || 1.0;
    this.reasoning = config.reasoning;
    this.tools = config.tools;
    this.responseFormat = config.responseFormat;
  }

  /**
   * Envoie une requÃªte au LLM (retourne le message complet maintenant)
   * Supporte structured outputs via response_format! ðŸŽ¯
   */
  async chat(
    messages: Message[],
    options?: { responseFormat?: OpenRouterConfig["responseFormat"] }
  ): Promise<any> {
    const startTime = Date.now();

    try {
      this.requestCount++;

      // Build request body (format du SDK officiel!)
      const requestBody: any = {
        model: this.model,
        messages,
        temperature: this.temperature,
      };

      // Add structured outputs if provided (prioritize options, then config)
      const responseFormat = options?.responseFormat || this.responseFormat;
      if (responseFormat) {
        requestBody.responseFormat = responseFormat;
      }

      // Tools are now in the system prompt (custom JSON format)
      // No native tool calling anymore!

      // Add reasoning params if configured (pour les modÃ¨les intelligents ðŸ§ )
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

      const response = await this.client.chat.send(requestBody);

      // CRITICAL: Detect and log empty/broken responses
      if (!response.choices || response.choices.length === 0) {
        logger.error("API returned no choices!", {
          fullResponse: JSON.stringify(response, null, 2),
        });
        throw new Error("API returned empty choices array");
      }

      const messageContent = response.choices[0]?.message?.content;
      if (
        messageContent === null ||
        messageContent === undefined ||
        messageContent === ""
      ) {
        logger.error("API returned empty content!", {
          choice: JSON.stringify(response.choices[0], null, 2),
          messageContent: messageContent,
          contentType: typeof messageContent,
          fullResponse: JSON.stringify(response, null, 2),
        });
      }

      // Parse usage info from OpenRouter (the good stuff ðŸ“Š)
      this.updateUsageStats(response.usage);

      const duration = Date.now() - startTime;

      if (process.env.DEBUG === "true") {
        const tokens = response.usage?.totalTokens || "?";
        const message = response.choices[0]?.message;
        const hasTools = message?.toolCalls
          ? ` | ${message.toolCalls.length} tool(s)`
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
            "Rate limit exceeded! T'abuses un peu lÃ ... ðŸŒ\n" +
              "Attends quelques secondes et rÃ©essaie."
          );
        }

        // Handle auth errors
        if (
          error.message.includes("401") ||
          error.message.includes("authentication")
        ) {
          throw new Error(
            "API key invalide! T'as copiÃ© la bonne clÃ©? ðŸ”‘\n" +
              "Check ton .env file."
          );
        }

        throw new Error(`LLM request failed: ${error.message}`);
      }

      throw error;
    }
  }

  /**
   * Generate images via multimodal models (OpenRouter SDK)
   */
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions = {}
  ): Promise<ImageGenerationResult[]> {
    if (!prompt?.trim()) {
      throw new Error("Prompt is required for image generation");
    }

    const promptPreview = prompt.substring(0, 160);
    const modelPriority = this.getImageModelPriority(options.model);
    const errors: Array<{ model: string; error: Error }> = [];

    for (const modelId of modelPriority) {
      try {
        return await this.generateImageWithModel(prompt, modelId, options);
      } catch (error) {
        errors.push({ model: modelId, error: error as Error });
        logger.warn("[OpenRouter] Image model attempt failed", {
          model: modelId,
          error: (error as Error).message,
          promptPreview,
        });
      }
    }

    logger.error("[OpenRouter] All image models failed", {
      promptPreview,
      attempts: errors.map((entry) => ({
        model: entry.model,
        error: entry.error.message,
      })),
    });

    const lastError = errors.at(-1);
    const failure = new Error(
      `Image generation failed: ${lastError?.message || "unknown error"}`
    );
    (failure as any).cause = lastError;
    throw failure;
  }

  private getImageModelPriority(requested?: string): string[] {
    const priority: string[] = [];
    const seen = new Set<string>();
    const envModel = process.env.OPENROUTER_IMAGE_MODEL;

    const push = (model?: string) => {
      const trimmed = model?.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        priority.push(trimmed);
      }
    };

    push(requested);
    push(envModel);
    IMAGE_MODEL_FALLBACKS.forEach(push);

    if (priority.length === 0) {
      push(DEFAULT_IMAGE_MODEL);
    }

    return priority;
  }

  private async generateImageWithModel(
    prompt: string,
    modelId: string,
    options: ImageGenerationOptions
  ): Promise<ImageGenerationResult[]> {
    const requestBody: any = {
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
      stream: false,
    };

    if (options.aspectRatio) {
      requestBody.image_config = { aspect_ratio: options.aspectRatio };
    }

    try {
      this.requestCount++;
      const response = await this.client.chat.send(requestBody);
      this.updateUsageStats(response?.usage);

      const message = response?.choices?.[0]?.message as
        | AssistantMessageWithImages
        | undefined;
      const images = message?.images;
      if (!images || images.length === 0) {
        logger.error("[OpenRouter] Image generation returned no images", {
          model: modelId,
          promptPreview: prompt.substring(0, 160),
          fullResponse: response,
        });
        throw new Error("Image generation returned no images");
      }

      const results: Array<ImageGenerationResult | null> = images.map(
        (image) => {
          const dataUrl =
            image?.image_url?.url ||
            image?.imageUrl?.url ||
            image?.imageURL?.url;

          if (!dataUrl) {
            return null;
          }

          return {
            dataUrl,
            mimeType: this.extractMimeTypeFromDataUrl(dataUrl),
          };
        }
      );

      const filtered = results.filter(
        (item): item is ImageGenerationResult => item !== null
      );

      if (filtered.length === 0) {
        logger.error("[OpenRouter] Image generation returned malformed data", {
          model: modelId,
          promptPreview: prompt.substring(0, 160),
          fullResponse: response,
        });
        throw new Error("Image generation returned malformed data");
      }

      logger.info("[OpenRouter] Image generation succeeded", {
        model: modelId,
        count: filtered.length,
      });

      return filtered;
    } catch (error) {
      if ((error as Error).message !== "Image generation returned no images") {
        logger.error("[OpenRouter] Image generation request failed", {
          model: modelId,
          promptPreview: prompt.substring(0, 160),
          aspectRatio: options.aspectRatio,
          error: (error as Error).message,
          stack: (error as Error).stack,
        });
      }
      throw error;
    }
  }
  /**
   * Run a web search request using the OpenRouter web plugin
   * Returns the raw assistant response so the caller can inject it in the loop
   */
  async webSearch(query: string, options: WebSearchOptions = {}): Promise<any> {
    if (!query?.trim()) {
      throw new Error("query is required for web search");
    }

    const startTime = Date.now();

    try {
      this.requestCount++;

      const requestedMax = Number.isFinite(
        typeof options.maxResults === "number" ? options.maxResults : Number.NaN
      )
        ? Math.floor(options.maxResults as number)
        : 5;

      const normalizedMaxResults = Math.min(Math.max(requestedMax || 5, 1), 10);

      const pluginConfig: any = {
        id: "web",
        max_results: normalizedMaxResults,
      };

      if (options.searchPrompt?.trim()) {
        pluginConfig.search_prompt = options.searchPrompt.trim();
      }

      const systemPrompt =
        "You are a focused research assistant. Use the attached real-time web search results to produce a concise, factual summary. Cite every claim with markdown links named using the domain (e.g. [nytimes.com](https://nytimes.com/...)). If nothing relevant is found, say so.";

      const messages: Message[] = [
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
      };

      if (options.searchContextSize) {
        requestBody.webSearchOptions = {
          searchContextSize: options.searchContextSize,
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

      const response = await this.client.chat.send(requestBody);

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
    messages: Message[],
    maxRetries = 3,
    options?: { responseFormat?: OpenRouterConfig["responseFormat"] }
  ): Promise<any> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.chat(messages, options);
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
              `\nâš ï¸  Retry ${attempt + 1}/${maxRetries} in ${delay}ms...`
            )
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Stream responses avec tool calls support! ðŸŒŠ
   * Yield des objets diffÃ©rents selon le type: content, thinking, tool_calls, usage
   */
  async *chatStream(
    messages: Message[],
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

      // Stream avec le SDK officiel! ðŸŒŠ
      const stream: any = await this.client.chat.send(requestBody);

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
                new Error(`Stream stall dÃ©tectÃ© (${elapsed}ms sans chunk)`)
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

              // Log quand on dÃ©marre un nouveau tool call
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

          // Log combien de tool calls on a accumulÃ©
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

    // Reasoning tokens (si le modÃ¨le pense ðŸ§ )
    const reasoningTokens =
      usage.completion_tokens_details?.reasoning_tokens || 0;
    this.totalReasoningTokens += reasoningTokens;

    // Cached tokens (optimization FTW âš¡)
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens || 0;
    this.totalCachedTokens += cachedTokens;

    // Real cost from OpenRouter (enfin des vrais chiffres! ðŸ’°)
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

  private extractMimeTypeFromDataUrl(dataUrl: string): string {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    return match?.[1] || "image/png";
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
   * Get stats (avec les VRAIES infos maintenant! ðŸ“Š)
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
