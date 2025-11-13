// test/tools/todo-tools.test.ts
/**
 * Tests pour le tool unifié de gestion de todos
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TodoTool } from "../../src/tools/todo-tools.js";
import { TodoManager } from "../../src/core/todo-manager.js";
import type { Agent } from "../../src/core/agent.js";

describe("TodoTool", () => {
  let mockAgent: Agent;
  let todoManager: TodoManager;
  let tool: TodoTool;

  beforeEach(() => {
    todoManager = new TodoManager();
    mockAgent = {
      getTodoManager: () => todoManager,
    } as unknown as Agent;
    tool = new TodoTool();
  });

  describe("add action", () => {
    it("should add a single task (string)", async () => {
      const result = await tool.execute(
        { action: "add", tasks: "Test single task" },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("add");
      expect(result.added).toBe(1);
      expect(result.task).toBe("Test single task");
      expect(result.stats?.total).toBe(1);
      expect(result.stats?.pending).toBe(1);

      const todos = todoManager.listTodos();
      expect(todos.length).toBe(1);
      expect(todos[0].task).toBe("Test single task");
    });

    it("should add multiple tasks (array)", async () => {
      const tasks = ["Task 1", "Task 2", "Task 3"];
      const result = await tool.execute({ action: "add", tasks }, mockAgent);

      expect(result.success).toBe(true);
      expect(result.action).toBe("add");
      expect(result.added).toBe(3);
      expect(result.tasks).toEqual(tasks);
      expect(result.stats?.total).toBe(3);
      expect(result.stats?.pending).toBe(3);

      const todos = todoManager.listTodos();
      expect(todos.length).toBe(3);
      expect(todos.map((t) => t.task)).toEqual(tasks);
    });

    it("should handle empty array", async () => {
      const result = await tool.execute(
        { action: "add", tasks: [] },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.added).toBe(0);
    });

    it("should reject missing tasks parameter", async () => {
      const result = await tool.execute({ action: "add" }, mockAgent);

      expect(result.success).toBe(false);
      expect(result.error).toContain("required");
    });

    it("should reject invalid tasks type", async () => {
      const result = await tool.execute(
        { action: "add", tasks: 123 },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("must be a string or an array");
    });
  });

  describe("markasdone action", () => {
    beforeEach(() => {
      todoManager.addTodo("Test task");
    });

    it("should mark an existing task as done", async () => {
      const result = await tool.execute(
        { action: "markasdone", task: "Test task" },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("markasdone");
      expect(result.task).toBe("Test task");
      expect(result.stats?.completed).toBe(1);

      const todos = todoManager.listTodos();
      expect(todos[0].completed).toBe(true);
    });

    it("should fail to mark non-existent task", async () => {
      const result = await tool.execute(
        { action: "markasdone", task: "Non-existent task" },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should reject missing task parameter", async () => {
      const result = await tool.execute({ action: "markasdone" }, mockAgent);

      expect(result.success).toBe(false);
      expect(result.error).toContain("required");
    });
  });

  describe("delete action", () => {
    beforeEach(() => {
      todoManager.addTodos(["Task 1", "Task 2", "Task 3"]);
    });

    it("should delete an existing task", async () => {
      const result = await tool.execute(
        { action: "delete", task: "Task 2" },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("delete");
      expect(result.task).toBe("Task 2");
      expect(result.stats?.total).toBe(2);

      const todos = todoManager.listTodos();
      expect(todos.length).toBe(2);
      expect(todos.map((t) => t.task)).toEqual(["Task 1", "Task 3"]);
    });

    it("should fail to delete non-existent task", async () => {
      const result = await tool.execute(
        { action: "delete", task: "Non-existent" },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should reject missing task parameter", async () => {
      const result = await tool.execute({ action: "delete" }, mockAgent);

      expect(result.success).toBe(false);
      expect(result.error).toContain("required");
    });
  });

  describe("reset action", () => {
    it("should clear all todos", async () => {
      todoManager.addTodos(["Task 1", "Task 2", "Task 3"]);

      const result = await tool.execute({ action: "reset" }, mockAgent);

      expect(result.success).toBe(true);
      expect(result.action).toBe("reset");
      expect(result.cleared).toBe(3);

      const todos = todoManager.listTodos();
      expect(todos.length).toBe(0);
    });

    it("should handle empty todo list", async () => {
      const result = await tool.execute({ action: "reset" }, mockAgent);

      expect(result.success).toBe(true);
      expect(result.cleared).toBe(0);
    });
  });

  describe("invalid action", () => {
    it("should reject unknown action", async () => {
      const result = await tool.execute({ action: "invalid" }, mockAgent);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown action");
    });

    it("should require action parameter", async () => {
      const result = await tool.execute({}, mockAgent);

      expect(result.success).toBe(false);
      expect(result.error).toContain("required");
    });
  });

  describe("integration workflow", () => {
    it("should support complete workflow with unified tool", async () => {
      // Add batch tasks
      await tool.execute(
        {
          action: "add",
          tasks: ["Create HTML", "Create CSS", "Create JS", "Test everything"],
        },
        mockAgent
      );

      expect(todoManager.getStats().total).toBe(4);
      expect(todoManager.getStats().pending).toBe(4);

      // Mark some as done
      await tool.execute(
        { action: "markasdone", task: "Create HTML" },
        mockAgent
      );
      await tool.execute(
        { action: "markasdone", task: "Create CSS" },
        mockAgent
      );

      expect(todoManager.getStats().completed).toBe(2);
      expect(todoManager.getStats().pending).toBe(2);

      // Delete a task
      await tool.execute({ action: "delete", task: "Create JS" }, mockAgent);

      expect(todoManager.getStats().total).toBe(3);

      // Reset all
      await tool.execute({ action: "reset" }, mockAgent);

      expect(todoManager.getStats().total).toBe(0);
    });
  });
});
