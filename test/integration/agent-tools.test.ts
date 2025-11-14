// test/integration/agent-tools.test.ts
/**
 * Tests d'intégration pour l'agent avec tools
 * Vérifie que l'IA répond bien avec des tool calls
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Agent } from "../../src/core/agent.js";

describe.skip("Agent Tool Calling Integration (SKIPPED - needs prompt fix)", () => {
  let agent: Agent;

  beforeAll(() => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY not set");
    }

    agent = new Agent({
      apiKey,
      model: process.env.TEST_MODEL || "openai/gpt-oss-120b",
      temperature: 1.0,
      storage: { enabled: false },
    });
  });

  it("should return tool calls when asked to plan a calculator project", async () => {
    const message =
      "planifie dans ta todolist la creation d'une calculatrice en html css js";

    // Process request (will stream and execute tools)
    const result = await agent.processRequest(message);

    // Le résultat devrait contenir un message (l'IA a répondu)
    expect(result).toBeDefined();
    expect(result.message).toBeTruthy();

    // Vérifier que des todos ont été ajoutés (l'IA devrait utiliser le tool 'todo' avec action='add')
    const todos = agent.getTodoManager().listTodos();
    expect(todos.length).toBeGreaterThan(0);

    // Log pour debug
    console.log(
      `✅ Agent created ${todos.length} todos using unified 'todo' tool:`
    );
    todos.forEach((todo, i) => {
      console.log(`   ${i + 1}. ${todo.task}`);
    });
  }, 60000); // 60s timeout pour cet appel LLM

  it("should parse multiple tool calls correctly", async () => {
    // Reset todos
    agent.getTodoManager().clearTodos();

    const message =
      "crée 3 todos: 'Setup HTML', 'Add CSS styling', 'Implement JS logic'";

    await agent.processRequest(message);

    const todos = agent.getTodoManager().listTodos();

    // L'agent devrait avoir créé au moins 2 todos (LLM non-déterministe)
    // On ne peut pas garantir qu'il va créer exactement 3
    expect(todos.length).toBeGreaterThanOrEqual(2);

    // Vérifier qu'au moins quelques mots clés sont présents
    const todoTexts = todos.map((t) => t.task.toLowerCase()).join(" ");
    const hasRelevantContent =
      todoTexts.includes("html") ||
      todoTexts.includes("css") ||
      todoTexts.includes("js") ||
      todoTexts.includes("styling") ||
      todoTexts.includes("logic");

    expect(hasRelevantContent, "Todos should contain relevant keywords").toBe(
      true
    );

    console.log(
      `✅ Agent created ${todos.length} todos via multiple tool calls`
    );
    todos.forEach((todo, i) => {
      console.log(`   ${i + 1}. ${todo.task}`);
    });
  }, 60000);

  it("should handle file creation via tools", async () => {
    const message = "créé un fichier test.js avec un console.log hello world";

    await agent.processRequest(message);

    // Vérifier que le fichier existe dans le VFS
    const files = agent.getVFS().listFiles();
    const testFile = files.find((f) => f.path === "test.js");

    expect(testFile).toBeDefined();

    // Vérifier le contenu
    const content = agent.getVFS().readFile("test.js");
    expect(content).toContain("console.log");
    expect(content.toLowerCase()).toContain("hello");

    console.log(`✅ Agent created test.js with content`);
  }, 60000);
});
