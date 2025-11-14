// test/tools/control-tools.test.ts
/**
 * Tests unitaires pour SendMessageTool et StopTool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SendMessageTool, StopTool } from "../../src/tools/control-tools.js";
import type { Agent } from "../../src/core/agent.js";

describe("SendMessageTool", () => {
  let sendMessageTool: SendMessageTool;
  let mockAgent: any;

  beforeEach(() => {
    sendMessageTool = new SendMessageTool();

    mockAgent = {
      getMemory: () => ({
        getMessages: vi.fn(() => [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
        ]),
      }),
      getTodoManager: () => ({
        listTodos: vi.fn(() => [
          { task: "Task 1", completed: false, createdAt: new Date() },
        ]),
      }),
      getLastActions: vi.fn(() => [
        { tool: "file", result: { success: true, filename: "test.js" } },
      ]),
      getLLMClient: () => ({
        chatStream: vi.fn(async function* () {
          yield { type: "content", content: "Hello " };
          yield { type: "content", content: "from " };
          yield { type: "content", content: "AI!" };
          yield { type: "done", content: "Hello from AI!" };
        }),
      }),
    };
  });

  describe("execute", () => {
    it("should successfully send a message", async () => {
      const result = await sendMessageTool.execute({}, mockAgent);

      expect(result.success).toBe(true);
      expect(result.streamed).toBe(true);
      expect(result.message).toContain("Hello from AI!");
    });

    it("should call LLM with correct context", async () => {
      await sendMessageTool.execute({}, mockAgent);

      expect(mockAgent.getLLMClient().chatStream).toHaveBeenCalled();
      expect(mockAgent.getMemory().getMessages).toHaveBeenCalled();
      expect(mockAgent.getTodoManager().listTodos).toHaveBeenCalled();
    });

    it("should handle streaming errors", async () => {
      mockAgent.getLLMClient().chatStream = vi.fn(async function* () {
        throw new Error("Streaming failed");
      });

      const result = await sendMessageTool.execute({}, mockAgent);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Streaming failed");
    });
  });

  describe("tool definition", () => {
    it("should have correct name", () => {
      expect(sendMessageTool.name).toBe("send_message");
    });

    it("should have no required parameters", () => {
      const definition = sendMessageTool.getDefinition();
      expect(definition.function.parameters.required).toEqual([]);
    });
  });
});

describe("StopTool", () => {
  let stopTool: StopTool;
  let mockAgent: any;

  beforeEach(() => {
    stopTool = new StopTool();
    mockAgent = {}; // Stop tool doesn't need agent functionality
  });

  describe("execute", () => {
    it("should successfully signal stop", async () => {
      const result = await stopTool.execute({}, mockAgent);

      expect(result.success).toBe(true);
      expect(result.action).toBe("stop");
      expect(result.message).toContain("completed");
    });

    it("should not require any parameters", async () => {
      const result = await stopTool.execute({}, mockAgent);

      expect(result.success).toBe(true);
    });
  });

  describe("tool definition", () => {
    it("should have correct name", () => {
      expect(stopTool.name).toBe("stop");
    });

    it("should have no parameters", () => {
      const definition = stopTool.getDefinition();
      expect(Object.keys(definition.function.parameters.properties)).toHaveLength(0);
    });
  });
});
