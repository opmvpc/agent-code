// src/tools/websearch-tool.ts
/**
 * Tool pour dǸclencher une recherche web temps-rǸel via OpenRouter
 */

import { BaseTool, type ToolResult } from "./base-tool.js";
import type { Agent } from "../core/agent.js";

type SearchContextSize = "low" | "medium" | "high";

export class WebSearchTool extends BaseTool {
  readonly name = "websearch";
  readonly description =
    "Fetch fresh information from the web via OpenRouter's web plugin. Use detailed queries. Results are appended to the conversation and must be processed in the next reasoning step.";

  protected getParametersSchema() {
    return {
      properties: {
        query: {
          type: "string",
          description:
            "Exact search query describing what you need to know. Be explicit and include entities, dates, and key constraints.",
        },
        max_results: {
          type: "number",
          minimum: 1,
          maximum: 10,
          description:
            "Optional: number of web results to retrieve (1-10, default 5). Higher values cost more.",
        },
        search_context_size: {
          type: "string",
          enum: ["low", "medium", "high"],
          description:
            "Optional: amount of search context (affects provider pricing). Defaults to medium.",
        },
        search_prompt: {
          type: "string",
          description:
            "Optional: custom instructions injected into the web plugin prompt to focus on what matters.",
        },
        context: {
          type: "string",
          description:
            "Optional background info (project goal, hypotheses, constraints) to guide the search instructions.",
        },
      },
      required: ["query"],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    try {
      this.validateArgs(args, ["query"]);
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }

    const query = typeof args.query === "string" ? args.query.trim() : "";

    if (!query) {
      return { success: false, error: "query must be a non-empty string" };
    }

    const maxResults = this.normalizeMaxResults(args.max_results);
    const searchContextSize = this.normalizeContextSize(
      args.search_context_size
    );
    const searchPrompt =
      typeof args.search_prompt === "string" && args.search_prompt.trim()
        ? args.search_prompt.trim()
        : undefined;
    const context =
      typeof args.context === "string" && args.context.trim()
        ? args.context.trim()
        : undefined;

    try {
      const llmClient = agent.getLLMClient();
      const response = await llmClient.webSearch(query, {
        maxResults,
        searchPrompt,
        searchContextSize,
        context,
      });

      const assistantMessage = response?.choices?.[0]?.message || {};
      const annotations = Array.isArray((assistantMessage as any).annotations)
        ? (assistantMessage as any).annotations
        : [];
      const content = this.extractMessageContent(
        (assistantMessage as any).content
      );

      return {
        success: true,
        action: "websearch",
        query,
        maxResults,
        searchContextSize,
        message: content,
        annotations,
        usage: response?.usage,
        model: response?.model,
        note:
          "These search results were added to the conversation. Review and use them in the next step.",
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Convert potential streamed message formats into a string
   */
  private extractMessageContent(content: any): string {
    if (!content) {
      return "";
    }

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }
          if (part?.type === "text" && typeof part.text === "string") {
            return part.text;
          }
          if (typeof part?.content === "string") {
            return part.content;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }

    if (typeof content === "object" && typeof content.text === "string") {
      return content.text;
    }

    return "";
  }

  private normalizeMaxResults(value: any): number {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return 5;
    }

    return Math.min(Math.max(Math.floor(num), 1), 10);
  }

  private normalizeContextSize(
    value: any
  ): SearchContextSize | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    const normalized = value.toLowerCase() as SearchContextSize;
    if (["low", "medium", "high"].includes(normalized)) {
      return normalized;
    }

    return undefined;
  }
}

