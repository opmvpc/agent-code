// test/tools/tool-registry.test.ts
/**
 * Tests pour le ToolRegistry
 */

import { describe, it, expect, beforeEach } from "vitest";
import { toolRegistry } from "../../src/tools/index.js";
import type { Agent } from "../../src/core/agent.js";

describe("ToolRegistry", () => {
  it("should have multiple tools registered", () => {
    // Au lieu de hardcoder le nombre, on vérifie qu'il y en a un minimum
    expect(toolRegistry.count()).toBeGreaterThan(10);

    // Vérifier qu'on a bien des tools
    const allTools = toolRegistry.getAllTools();
    expect(allTools.length).toBe(toolRegistry.count());
  });

  it("should have all essential tools registered", () => {
    // Liste des tools essentiels (catégories principales)
    const essentialTools = {
      files: ["write_file", "read_file", "list_files", "delete_file"],
      execution: ["execute_code"],
      todos: ["todo"], // Unified tool!
      control: ["send_message", "stop"],
      projects: ["create_project", "switch_project", "list_projects"],
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
    const tool = toolRegistry.getTool("write_file");

    expect(tool).toBeDefined();
    expect(tool?.name).toBe("write_file");
    expect(tool?.description).toBeTruthy();
  });

  it("should return undefined for unknown tool", () => {
    const tool = toolRegistry.getTool("nonexistent_tool");
    expect(tool).toBeUndefined();
  });

  it("should execute a tool successfully", async () => {
    // Mock agent avec méthodes minimales
    const mockAgent = {
      getVFS: () => ({
        writeFile: () => {},
        readFile: () => "test content",
        listFiles: () => [],
        deleteFile: () => {},
      }),
      getMemory: () => ({
        addFileCreated: () => {},
      }),
    } as unknown as Agent;

    const result = await toolRegistry.execute(
      "write_file",
      { filename: "test.js", content: "console.log('test');" },
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
