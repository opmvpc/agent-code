// test/tools/websearch-tool.test.ts
/**
 * Tests unitaires pour WebSearchTool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { WebSearchTool } from "../../src/tools/websearch-tool.js";
import type { Agent } from "../../src/core/agent.js";

describe("WebSearchTool", () => {
  let tool: WebSearchTool;
  let mockAgent: Partial<Agent>;
  let webSearchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tool = new WebSearchTool();
    webSearchMock = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "Here are the latest findings",
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  url: "https://example.com/report",
                  title: "Example",
                },
              },
            ],
          },
        },
      ],
      usage: { total_tokens: 123 },
      model: "openai/gpt-4o:online",
    });

    mockAgent = {
      getLLMClient: () => ({
        webSearch: webSearchMock,
      }),
    } as Partial<Agent>;
  });

  it("should execute a search and return the assistant message", async () => {
    const result = await tool.execute(
      {
        query: "Latest AI research breakthroughs 2024",
        max_results: 6,
        search_context_size: "high",
        search_prompt: "Focus on citations and funding rounds",
        context: "Researching for investor memo",
      },
      mockAgent as Agent
    );

    expect(webSearchMock).toHaveBeenCalledWith(
      "Latest AI research breakthroughs 2024",
      {
        maxResults: 6,
        searchPrompt: "Focus on citations and funding rounds",
        searchContextSize: "high",
        context: "Researching for investor memo",
      }
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("latest findings");
    expect(result.annotations).toHaveLength(1);
    expect(result.note).toMatch(/added to the conversation/i);
  });

  it("should clamp invalid options and flatten structured content", async () => {
    webSearchMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: [
              { type: "text", text: "Line 1" },
              { type: "text", text: "Line 2" },
            ],
            annotations: [],
          },
        },
      ],
      usage: {},
      model: "test",
    });

    const result = await tool.execute(
      {
        query: "Space news",
        max_results: 20,
        search_context_size: "invalid",
      },
      mockAgent as Agent
    );

    expect(webSearchMock).toHaveBeenCalledWith("Space news", {
      maxResults: 10,
      searchPrompt: undefined,
      searchContextSize: undefined,
      context: undefined,
    });
    expect(result.message).toBe("Line 1\nLine 2");
  });

  it("should return error when query is missing", async () => {
    const result = await tool.execute({}, mockAgent as Agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain("query");
  });

  it("should surface errors from the web search client", async () => {
    webSearchMock.mockRejectedValue(new Error("Quota exceeded"));

    const result = await tool.execute(
      {
        query: "Climate change policy",
      },
      mockAgent as Agent
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Quota exceeded");
  });
});

