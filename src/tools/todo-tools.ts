// src/tools/todo-tools.ts
/**
 * Tool unifié pour la gestion de la todolist interne de l'agent
 */

import { BaseTool, type ToolResult } from "./base-tool.js";
import type { Agent } from "../core/agent.js";

/**
 * Tool unifié pour gérer la todolist avec différentes actions
 */
export class TodoTool extends BaseTool {
  readonly name = "todo";
  readonly description =
    "Manage your internal todo list. Supports add, delete, markasdone, and reset actions.";

  protected getParametersSchema() {
    return {
      properties: {
        action: {
          type: "string",
          enum: ["add", "delete", "markasdone", "reset"],
          description:
            "Action to perform: 'add' (add tasks), 'delete' (remove task), 'markasdone' (mark as completed), 'reset' (clear all)",
        },
        tasks: {
          oneOf: [
            {
              type: "string",
              description: "A single task description",
            },
            {
              type: "array",
              items: { type: "string" },
              description: "Array of task descriptions (for 'add' action)",
            },
          ],
          description:
            "Task(s) to add (required for 'add' action). Can be a string or array of strings.",
        },
        task: {
          type: "string",
          description:
            "Task description to delete or mark as done (required for 'delete' and 'markasdone' actions)",
        },
      },
      required: ["action"],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    // Validate action parameter manually (don't throw)
    if (!args.action) {
      return {
        success: false,
        error: "action parameter is required",
      };
    }

    const { action, tasks, task } = args;
    const todoManager = agent.getTodoManager();

    switch (action) {
      case "add":
        return this.handleAdd(tasks, todoManager);

      case "delete":
        return this.handleDelete(task, todoManager);

      case "markasdone":
        return this.handleMarkAsDone(task, todoManager);

      case "reset":
        return this.handleReset(todoManager);

      default:
        return {
          success: false,
          error: `Unknown action: ${action}. Use 'add', 'delete', 'markasdone', or 'reset'.`,
        };
    }
  }

  /**
   * Handle adding tasks
   */
  private handleAdd(tasks: any, todoManager: any): ToolResult {
    if (!tasks) {
      return {
        success: false,
        error: "tasks parameter is required for 'add' action",
      };
    }

    // Handle single task (string)
    if (typeof tasks === "string") {
      todoManager.addTodo(tasks);
      return {
        success: true,
        action: "add",
        added: 1,
        task: tasks,
        stats: todoManager.getStats(),
      };
    }

    // Handle multiple tasks (array)
    if (Array.isArray(tasks)) {
      if (tasks.length === 0) {
        return {
          success: false,
          error: "tasks array must contain at least one task",
        };
      }

      todoManager.addTodos(tasks);
      return {
        success: true,
        action: "add",
        added: tasks.length,
        tasks: tasks,
        stats: todoManager.getStats(),
      };
    }

    return {
      success: false,
      error: "tasks must be an array of strings (or a single string)",
    };
  }

  /**
   * Handle deleting a task
   */
  private handleDelete(task: string, todoManager: any): ToolResult {
    if (!task) {
      return {
        success: false,
        error: "task parameter is required for 'delete' action",
      };
    }

    const todos = todoManager.listTodos();
    const index = todos.findIndex((t: any) => t.task === task);

    if (index === -1) {
      return {
        success: false,
        error: `Task not found: ${task}`,
      };
    }

    // Remove from array
    todoManager.deleteTodo(task);

    return {
      success: true,
      action: "delete",
      task,
      stats: todoManager.getStats(),
    };
  }

  /**
   * Handle marking task as done
   */
  private handleMarkAsDone(task: string, todoManager: any): ToolResult {
    if (!task) {
      return {
        success: false,
        error: "task parameter is required for 'markasdone' action",
      };
    }

    const success = todoManager.completeTodo(task);

    if (success) {
      return {
        success: true,
        action: "markasdone",
        task,
        stats: todoManager.getStats(),
      };
    } else {
      return {
        success: false,
        error: `Task not found: ${task}`,
      };
    }
  }

  /**
   * Handle resetting all todos
   */
  private handleReset(todoManager: any): ToolResult {
    const count = todoManager.getStats().total;
    todoManager.clearTodos();

    return {
      success: true,
      action: "reset",
      cleared: count,
      message: `Cleared ${count} todos`,
    };
  }
}
