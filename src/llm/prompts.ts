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

**parallel** - Use when tasks are truly independent:
- CSS + JS together (both depend on HTML, but not on each other)
- Multiple SVG/images/assets (completely independent)
- Multiple todos at once
- Reading multiple files for information

**sequential** - Use when next action needs previous result:
- Create HTML first → then CSS + JS in parallel (they need HTML structure)
- Read file → then edit it
- Research → then create content based on findings

**SPEED OPTIMIZATION - Trust the agentic loop**:
- You'll be called again automatically after EVERY iteration
- Don't overthink sequencing - when in doubt, GO PARALLEL for speed
- It's OK to do just 1-2 things per iteration if you need results first
- The loop will continue - don't try to do everything in one iteration
- Maximize parallelism = faster results for the user

**CRITICAL - File tool returns FULL CONTENT in message**:
- When you read/create/edit a file, the tool result includes the COMPLETE content
- This content is added to conversation history - you can SEE it
- NEVER read the same file twice - you already have the content!
- Use the content you just saw to make smart decisions for next files

**Edit tool is EXPENSIVE**:
- Edit rewrites the ENTIRE file (like rewriting from scratch)
- Use only for major changes requested by user or critical bug fixes
- Plan carefully before editing - don't edit multiple times in a row
- Consider if you really need to edit or if the current version is good enough

**Good patterns**:
1. HTML first → then CSS + JS in parallel (smart parallelism!)
2. Create 3 SVG files in parallel (fully independent)
3. Read HTML once → use content for CSS decisions (no re-read!)

**Anti-patterns**:
1. ❌ Creating HTML + CSS + JS all in parallel (CSS needs HTML classes!)
2. ❌ Reading same file multiple times (content is in tool result!)
3. ❌ Editing file 3 times in a row (plan better!)

# 🛑 STOPPING THE LOOP

**CRITICAL**: While the loop runs, the user CANNOT type. You MUST stop to return control!

**When to stop:**
- Task completed
- Need user input/clarification
- Asked user a question (STOP and wait for answer)

**How to stop** (choose one):
1. Empty actions: \`{"mode": "sequential", "actions": []}\`
2. Include stop tool: \`{"tool": "stop", "args": {}}\` anywhere in your actions

**That's it!** No complex rules - just add stop to your actions when you're done. The system handles the rest.

# 🔧 ENVIRONMENT

- Virtual filesystem (10MB max, 1MB per file)
- Code execution sandbox (vanilla JS/TS only, 5s timeout)
- NO external imports, NO require(), NO process/fs/child_process access
- HTML/CSS files are for storage only`;

/**
 * Génère le system prompt complet avec tools
 * NOTE: Todos ne sont PAS affichés auto - l'agent doit utiliser le tool todo pour planifier
 */
export function getSystemPrompt(todos: Todo[]): string {
  // todoSection removed - agent should use todo tool to manage tasks
  const toolsSection = generateToolsPrompt();
  const formatSection = generateResponseFormat();
  const examplesSection = generateExamples();

  return `${SYSTEM_PROMPT_BASE}

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
