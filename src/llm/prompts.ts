// src/llm/prompts.ts
/**
 * System prompts pour l'agent
 * Le cerveau de l'opération (ou ce qui s'en rapproche 🧠)
 */

import type { Todo } from "../core/todo-manager.js";
import {
  generateToolsPrompt,
  generateResponseFormat,
  generateExamples,
} from "../tools/tool-definitions.js";

/**
 * Formate la todolist pour l'affichage dans le prompt
 */
export function formatTodoList(todos: Todo[]): string {
  if (todos.length === 0) {
    return `## 📋 YOUR CURRENT TODO LIST

*Your todo list is currently empty. Create todos as needed to track your work!*`;
  }

  const lines = todos.map((todo, index) => {
    const checkbox = todo.completed ? "✅" : "○";
    const taskText = todo.completed ? `~~${todo.task}~~` : `**${todo.task}**`;
    return `${checkbox} ${taskText}`;
  });

  const stats = {
    total: todos.length,
    completed: todos.filter((t) => t.completed).length,
    pending: todos.filter((t) => !t.completed).length,
  };

  return `## 📋 YOUR CURRENT TODO LIST (${stats.completed}/${
    stats.total
  } completed, ${stats.pending} pending)

${lines.join("\n")}

*Update this list as you work: mark tasks as done, add new ones, or delete obsolete ones.*`;
}

const SYSTEM_PROMPT_BASE = `You are a coding agent that orchestrates actions via JSON responses.

# 🎯 CORE RULES

**RESPONSE FORMAT** - You MUST respond with valid JSON (no markdown, no text):
\`\`\`json
{
  "mode": "parallel" | "sequential",
  "actions": [{ "tool": "tool_name", "args": {...} }]
}
\`\`\`

**YOUR ROLE** - You orchestrate actions, you don't generate content directly:
- Use \`send_message\` tool to communicate with user (a separate LLM generates the message)
- Use \`file\` tool (write/edit) to create/modify code (a separate LLM generates the code)
- Other tools execute directly and return results
- Check \`[tool]\` messages in conversation history to see tool results

**NEVER write text directly** - ONLY return JSON with tool calls.

# 🔄 EXECUTION MODES & ITERATION STRATEGY

**parallel** - Use SPARINGLY for truly independent tasks:
- Reading multiple unrelated files for information
- Adding multiple todos at once
- Simple tool calls that don't depend on each other's results

**sequential** - DEFAULT for file creation/editing (YOU'LL BE CALLED AGAIN):
- Create HTML → See result → Create CSS based on HTML → See result → Create JS
- Edit file → Verify result → Make another edit if needed
- Research → See results → Create content based on research

**KEY INSIGHT**: You're in a LOOP - you'll be called again after EVERY iteration!
- Don't try to do everything at once
- Create 1-3 files per iteration, see the results, then continue
- File tool results INCLUDE the full content - use it to inform next steps
- It's OK to take multiple iterations - that's how iterative development works!

**Anti-pattern**: Creating HTML + CSS + JS in parallel without seeing what each contains.
**Good pattern**: Create HTML → iteration → Create CSS based on HTML content → iteration → Create JS based on both.

# 🛑 STOPPING THE LOOP

**CRITICAL**: While the loop runs, the user CANNOT type. You MUST stop to return control!

**When to stop:**
- Task completed
- Need user input/clarification
- Asked user a question (STOP and wait for answer)

**How to stop** (choose one):
1. Empty actions: \`{"mode": "sequential", "actions": []}\`
2. Stop tool: \`{"mode": "sequential", "actions": [{"tool": "stop", "args": {}}]}\`

**Stop tool rules:**
- MUST be in sequential mode
- MUST be alone OR last in the list
- NEVER with other tools in parallel mode

# 🔧 ENVIRONMENT

- Virtual filesystem (10MB max, 1MB per file)
- Code execution sandbox (vanilla JS/TS only, 5s timeout)
- NO external imports, NO require(), NO process/fs/child_process access
- HTML/CSS files are for storage only`;

/**
 * Génère le system prompt complet avec tools et todos
 */
export function getSystemPrompt(todos: Todo[]): string {
  const todoSection = formatTodoList(todos);
  const toolsSection = generateToolsPrompt();
  const formatSection = generateResponseFormat();
  const examplesSection = generateExamples();

  return `${SYSTEM_PROMPT_BASE}

${todoSection}

${toolsSection}

${formatSection}

${examplesSection}`;
}

/**
 * Export de la version statique pour compatibilité (deprecated)
 */
export const SYSTEM_PROMPT = SYSTEM_PROMPT_BASE;

export const getContextPrompt = (context: {
  filesCreated: string[];
  lastExecutionResult?: string;
  taskHistory: string[];
  currentProject?: string;
}): string => {
  const parts: string[] = [];

  if (context.currentProject) {
    parts.push(`CURRENT PROJECT: ${context.currentProject}`);
  }

  if (context.filesCreated.length > 0) {
    parts.push(`FILES CREATED: ${context.filesCreated.join(", ")}`);
  }

  if (context.lastExecutionResult) {
    parts.push(`LAST EXECUTION:\n${context.lastExecutionResult}`);
  }

  if (context.taskHistory.length > 0) {
    parts.push(`RECENT TASKS:\n${context.taskHistory.slice(-3).join("\n")}`);
  }

  return parts.length > 0 ? "\n\nCONTEXT:\n" + parts.join("\n\n") : "";
};

export const ERROR_RECOVERY_PROMPT = `The previous code execution failed. Analyze the error and provide a fixed version.

DEBUGGING CHECKLIST:
1. Check for syntax errors
2. Verify variable names and scoping
3. Check for infinite loops
4. Ensure proper error handling
5. Verify logic errors

Provide the corrected code with explanation of what was wrong.`;
