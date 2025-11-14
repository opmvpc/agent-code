// test/tools/todo-tool.test.ts
/**
 * Tests unitaires pour TodoTool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { TodoTool } from "../../src/tools/todo-tools.js";
import type { Agent } from "../../src/core/agent.js";
import { createMockTodoManager } from "./test-helpers.js";

describe("TodoTool", () => {
  let todoTool: TodoTool;
  let mockAgent: any;
  let mockTodoManager: ReturnType<typeof createMockTodoManager>;

  beforeEach(() => {
    todoTool = new TodoTool();
    mockTodoManager = createMockTodoManager();

    mockAgent = {
      getTodoManager: () => mockTodoManager,
    };
  });

  describe("add action", () => {
    it("should add a single todo", async () => {
      const result = await todoTool.execute(
        {
          action: "add",
          tasks: ["New task"],
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("add");
      expect(result.added).toBe(1);
    });

    it("should add multiple todos", async () => {
      const result = await todoTool.execute(
        {
          action: "add",
          tasks: ["Task A", "Task B", "Task C"],
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.added).toBe(3);
      expect(mockAgent.getTodoManager().addTodos).toHaveBeenCalledWith([
        "Task A",
        "Task B",
        "Task C",
      ]);
    });

    it("should return error if tasks is missing", async () => {
      const result = await todoTool.execute(
        {
          action: "add",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("tasks parameter is required");
    });

    it("should return error if tasks is not an array", async () => {
      const result = await todoTool.execute(
        {
          action: "add",
          tasks: "not an array",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("must be an array");
    });

    it("should return error if tasks array is empty", async () => {
      const result = await todoTool.execute(
        {
          action: "add",
          tasks: [],
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("at least one task");
    });
  });

  describe("markasdone action", () => {
    it("should mark a todo as done", async () => {
      const result = await todoTool.execute(
        {
          action: "markasdone",
          task: "Task 1",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("markasdone");
      expect(mockTodoManager.completeTodo).toHaveBeenCalledWith("Task 1");
    });

    it("should return error if task is missing", async () => {
      const result = await todoTool.execute(
        {
          action: "markasdone",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("task parameter is required");
    });
  });

  describe("delete action", () => {
    it("should delete a todo", async () => {
      // Add a todo first so it can be deleted
      mockTodoManager.listTodos.mockReturnValue([
        { task: "Task 1", completed: false, createdAt: new Date() }
      ]);

      const result = await todoTool.execute(
        {
          action: "delete",
          task: "Task 1",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("delete");
      expect(mockTodoManager.deleteTodo).toHaveBeenCalledWith("Task 1");
    });

    it("should return error if task is missing", async () => {
      const result = await todoTool.execute(
        {
          action: "delete",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("task parameter is required");
    });
  });

  describe("reset action", () => {
    it("should clear all todos", async () => {
      const result = await todoTool.execute(
        {
          action: "reset",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("reset");
      expect(mockAgent.getTodoManager().clearTodos).toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("should return error if action is missing", async () => {
      const result = await todoTool.execute({}, mockAgent);

      expect(result.success).toBe(false);
      expect(result.error).toContain("action parameter is required");
    });

    it("should return error for unknown action", async () => {
      const result = await todoTool.execute(
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
    it("should have correct name", () => {
      expect(todoTool.name).toBe("todo");
    });

    it("should have valid schema with all actions", () => {
      const definition = todoTool.getDefinition();
      const actions = definition.function.parameters.properties.action.enum;
      expect(actions).toContain("add");
      expect(actions).toContain("delete");
      expect(actions).toContain("markasdone");
      expect(actions).toContain("reset");
    });
  });
});
