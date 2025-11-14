// test/tools/file-tool.test.ts
/**
 * Tests unitaires pour FileTool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { FileTool } from "../../src/tools/unified-file-tool.js";
import type { Agent } from "../../src/core/agent.js";

describe("FileTool", () => {
  let fileTool: FileTool;
  let mockAgent: any;

  beforeEach(() => {
    fileTool = new FileTool();

    // Mock Agent avec VFS et Memory
    const mockFiles = new Map<string, string>();
    mockAgent = {
      getVFS: () => ({
        readFile: vi.fn((filename: string) => {
          if (!mockFiles.has(filename)) {
            throw new Error(`File not found: ${filename}`);
          }
          return mockFiles.get(filename);
        }),
        writeFile: vi.fn((filename: string, content: string) => {
          mockFiles.set(filename, content);
        }),
        deleteFile: vi.fn((filename: string) => {
          if (!mockFiles.has(filename)) {
            throw new Error(`File not found: ${filename}`);
          }
          mockFiles.delete(filename);
        }),
        listFiles: vi.fn(() => {
          return Array.from(mockFiles.entries()).map(([path, content]) => ({
            path,
            size: new Blob([content]).size,
          }));
        }),
      }),
      getMemory: () => ({
        addFileCreated: vi.fn(),
        getMessages: vi.fn(() => [
          { role: "user", content: "Create a test file" },
        ]),
      }),
      getLLMClient: () => ({
        chat: vi.fn(async () => ({
          choices: [
            {
              message: {
                content: "console.log('Generated code');",
              },
            },
          ],
        })),
      }),
    };

    // Pre-populate some test files
    mockFiles.set("test.js", "console.log('test');");
    mockFiles.set("app.ts", "export const app = 'hello';");
  });

  describe("read action", () => {
    it("should read an existing file", async () => {
      const result = await fileTool.execute(
        {
          action: "read",
          filename: "test.js",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("read");
      expect(result.filename).toBe("test.js");
      expect(result.content).toBe("console.log('test');");
      expect(result.lines).toBe(1);
    });

    it("should return error if file does not exist", async () => {
      const result = await fileTool.execute(
        {
          action: "read",
          filename: "nonexistent.js",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should return error if filename is missing", async () => {
      const result = await fileTool.execute(
        {
          action: "read",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("filename parameter is required");
    });
  });

  describe("write action (AI-powered)", () => {
    it("should generate and write a new file with AI", async () => {
      const result = await fileTool.execute(
        {
          action: "write",
          filename: "generated.js",
          instructions: "Create a hello world function",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("write");
      expect(result.filename).toBe("generated.js");
      expect(result.generated).toBe(true);
    });

    it("should return error if filename is missing", async () => {
      const result = await fileTool.execute(
        {
          action: "write",
          instructions: "Create code",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("filename parameter is required");
    });

    it("should return error if instructions are missing", async () => {
      const result = await fileTool.execute(
        {
          action: "write",
          filename: "test.js",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("instructions parameter is required");
    });
  });

  describe("edit action (AI-powered)", () => {
    it("should edit an existing file with AI", async () => {
      const result = await fileTool.execute(
        {
          action: "edit",
          filename: "test.js",
          instructions: "Add a comment",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("edit");
      expect(result.filename).toBe("test.js");
      expect(result.modified).toBe(true);
    });

    it("should return error if filename is missing", async () => {
      const result = await fileTool.execute(
        {
          action: "edit",
          instructions: "Add comment",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("filename parameter is required");
    });
  });

  describe("list action", () => {
    it("should list all files", async () => {
      const result = await fileTool.execute(
        {
          action: "list",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("list");
      expect(result.files).toBeInstanceOf(Array);
      expect(result.count).toBe(2);
      expect(result.files[0]).toHaveProperty("path");
      expect(result.files[0]).toHaveProperty("extension");
    });
  });

  describe("delete action", () => {
    it("should delete an existing file", async () => {
      const result = await fileTool.execute(
        {
          action: "delete",
          filename: "test.js",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("delete");
      expect(result.filename).toBe("test.js");
    });

    it("should return error if file does not exist", async () => {
      const result = await fileTool.execute(
        {
          action: "delete",
          filename: "nonexistent.js",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("validation", () => {
    it("should return error if action is missing", async () => {
      const result = await fileTool.execute({}, mockAgent);

      expect(result.success).toBe(false);
      expect(result.error).toContain("action parameter is required");
    });

    it("should return error for unknown action", async () => {
      const result = await fileTool.execute(
        {
          action: "invalid",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown action");
    });
  });

  describe("tool definition", () => {
    it("should have correct name and description", () => {
      expect(fileTool.name).toBe("file");
      expect(fileTool.description).toContain("CRUD");
    });

    it("should have valid schema", () => {
      const definition = fileTool.getDefinition();
      expect(definition.type).toBe("function");
      expect(definition.function.name).toBe("file");
      expect(definition.function.parameters.properties.action).toBeDefined();
      expect(definition.function.parameters.properties.filename).toBeDefined();
      expect(definition.function.parameters.properties.instructions).toBeDefined();
    });
  });
});
