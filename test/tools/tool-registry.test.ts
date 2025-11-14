// test/tools/tool-registry.test.ts
/**
 * Tests pour le ToolRegistry
 */

import { describe, it, expect, beforeEach } from "vitest";
import { toolRegistry } from "../../src/tools/index.js";
import type { Agent } from "../../src/core/agent.js";

describe("ToolRegistry", () => {
  it("should have multiple tools registered", () => {
    // With unified tools: file, project, todo, execute_code, send_message, stop = 6 tools
    expect(toolRegistry.count()).toBeGreaterThanOrEqual(6);

    // Vérifier qu'on a bien des tools
    const allTools = toolRegistry.getAllTools();
    expect(allTools.length).toBe(toolRegistry.count());
  });

  it("should have all essential tools registered", () => {
    // Updated for unified tools system
    const essentialTools = {
      files: ["file"], // Unified file tool (read/write/edit/list/delete)
      execution: ["execute_code"],
      todos: ["todo"], // Unified todo tool (add/delete/markasdone/reset)
      control: ["send_message", "stop"],
      projects: ["project"], // Unified project tool (create/switch/list)
    };

    // Vérifier chaque catégorie
    Object.entries(essentialTools).forEach(([category, tools]) => {
      tools.forEach((toolName) => {
        expect(
          toolRegistry.has(toolName),
          `Tool "${toolName}" (${category}) should be registered`
        ).toBe(true);
      });
    });
  });

  it("should return valid tool definitions for API", () => {
    const definitions = toolRegistry.getToolDefinitions();

    // Vérifier qu'on a des définitions (pas de nombre hardcodé)
    expect(definitions.length).toBeGreaterThan(0);
    expect(definitions.length).toBe(toolRegistry.count());

    // Vérifier que chaque définition a le bon format OpenAI
    definitions.forEach((def) => {
      expect(def).toHaveProperty("type", "function");
      expect(def).toHaveProperty("function");
      expect(def.function).toHaveProperty("name");
      expect(def.function).toHaveProperty("description");
      expect(def.function).toHaveProperty("parameters");
      expect(def.function.parameters).toHaveProperty("type", "object");
      expect(def.function.parameters).toHaveProperty("properties");
    });
  });

  it("should get a tool by name", () => {
    const tool = toolRegistry.getTool("file");

    expect(tool).toBeDefined();
    expect(tool?.name).toBe("file");
    expect(tool?.description).toBeTruthy();
  });

  it("should return undefined for unknown tool", () => {
    const tool = toolRegistry.getTool("nonexistent_tool");
    expect(tool).toBeUndefined();
  });

  it("should execute a tool successfully", async () => {
    // Mock agent avec méthodes minimales pour unified file tool
    const mockAgent = {
      getVFS: () => ({
        writeFile: () => {},
        readFile: () => "test content",
        listFiles: () => [],
        deleteFile: () => {},
      }),
      getLLMClient: () => ({
        chat: async () => ({
          choices: [{ message: { content: "console.log('test');" } }],
        }),
      }),
    } as unknown as Agent;

    const result = await toolRegistry.execute(
      "file",
      {
        action: "write",
        filename: "test.js",
        instructions: "create a test file",
      },
      mockAgent
    );

    expect(result.success).toBe(true);
    expect(result.filename).toBe("test.js");
  });

  it("should handle unknown tool execution", async () => {
    const mockAgent = {} as Agent;

    const result = await toolRegistry.execute("unknown_tool", {}, mockAgent);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown tool");
  });
});
