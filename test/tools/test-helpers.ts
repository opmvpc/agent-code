// test/tools/test-helpers.ts
/**
 * Helper functions et mocks partagés pour les tests
 */

import { vi } from "vitest";
import type { Agent } from "../../src/core/agent.js";
import type { TodoManager } from "../../src/core/todo-manager.js";

/**
 * Crée un mock complet du TodoManager pour les tests
 */
export function createMockTodoManager(): TodoManager {
  return {
    addTodo: vi.fn(),
    addTodos: vi.fn(),
    completeTodo: vi.fn().mockReturnValue(true),
    listTodos: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockReturnValue({ total: 0, completed: 0, pending: 0 }),
    deleteTodo: vi.fn().mockReturnValue(true),
    clearTodos: vi.fn(),
    displayTodos: vi.fn().mockReturnValue(""),
    getTodos: vi.fn().mockReturnValue([]), // Alias pour listTodos (legacy)
  } as any;
}

/**
 * Crée un mock de base de l'Agent pour les tests
 */
export function createMockAgent(): Partial<Agent> {
  return {
    getVFS: vi.fn().mockReturnValue({
      writeFile: vi.fn(),
      readFile: vi.fn().mockReturnValue("test content"),
      listFiles: vi.fn().mockReturnValue([]),
      deleteFile: vi.fn(),
      getStats: vi.fn().mockReturnValue({ name: "test.js", size: 100, created: new Date(), modified: new Date() }),
    }),
    getLLMClient: vi.fn().mockReturnValue({
      chat: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "// Generated code" } }],
      }),
      chatStream: vi.fn().mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: "Test message" } }] };
        },
      }),
    }),
    getTodoManager: vi.fn().mockReturnValue(createMockTodoManager()),
    getMemory: vi.fn().mockReturnValue({
      getMessages: vi.fn().mockReturnValue([]),
      addMessage: vi.fn(),
    }),
    getLastActions: vi.fn().mockReturnValue([]),
    createProject: vi.fn(),
    switchProject: vi.fn().mockResolvedValue(undefined),
    listProjects: vi.fn().mockReturnValue([]),
  } as any;
}
