// test/tools/execution-tool.test.ts
/**
 * Tests unitaires pour ExecuteCodeTool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExecuteCodeTool } from "../../src/tools/execution-tools.js";
import type { Agent } from "../../src/core/agent.js";

describe("ExecuteCodeTool", () => {
  let executeTool: ExecuteCodeTool;
  let mockAgent: any;

  beforeEach(() => {
    executeTool = new ExecuteCodeTool();

    const mockFiles = new Map<string, string>();
    mockFiles.set("test.js", "console.log('Hello');");
    mockFiles.set("calc.js", "const x = 40 + 2; x;");
    mockFiles.set("error.js", "throw new Error('test error');");

    mockAgent = {
      getVFS: () => ({
        readFile: vi.fn((filename: string) => {
          if (!mockFiles.has(filename)) {
            throw new Error(`File not found: ${filename}`);
          }
          return mockFiles.get(filename)!;
        }),
      }),
      getExecutor: () => ({
        execute: vi.fn(async (code: string, filename: string) => {
          // Simple mock execution
          if (code.includes("throw")) {
            return { error: "Runtime error", output: "" };
          }
          if (code.includes("console.log")) {
            return { output: "Output from console.log", error: null };
          }
          return { output: "42", error: null };
        }),
      }),
    };
  });

  describe("execute action", () => {
    it("should execute valid JavaScript code from file", async () => {
      const result = await executeTool.execute(
        {
          filename: "test.js",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.filename).toBe("test.js");
    });

    it("should return output from executed code", async () => {
      const result = await executeTool.execute(
        {
          filename: "calc.js",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe("42");
    });

    it("should handle execution errors", async () => {
      const result = await executeTool.execute(
        {
          filename: "error.js",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should return error if filename parameter is missing", async () => {
      await expect(executeTool.execute({}, mockAgent)).rejects.toThrow("filename");
    });

    it("should return error if file does not exist", async () => {
      const result = await executeTool.execute(
        {
          filename: "nonexistent.js",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("tool definition", () => {
    it("should have correct name", () => {
      expect(executeTool.name).toBe("execute_code");
    });

    it("should have valid schema", () => {
      const definition = executeTool.getDefinition();
      expect(definition.function.parameters.properties.filename).toBeDefined();
      expect(definition.function.parameters.required).toContain("filename");
    });
  });
});
