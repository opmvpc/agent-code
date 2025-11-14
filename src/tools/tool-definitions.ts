// src/tools/tool-definitions.ts
/**
 * Génère les définitions des tools pour le system prompt
 * Basé sur les classes de tools existantes
 */

import { toolRegistry } from "./tool-registry.js";

/**
 * Génère la documentation complète des tools pour le prompt
 */
export function generateToolsPrompt(): string {
  const tools = toolRegistry.getAllTools();

  const sections: string[] = [];

  sections.push("# 🛠️ AVAILABLE TOOLS\n");
  sections.push(
    "You have access to the following tools. You MUST respond with a JSON object containing your actions.\n"
  );

  // Format pour chaque tool
  for (const tool of tools) {
    const def = tool.getDefinition();
    sections.push(`## ${def.function.name}`);
    sections.push(`**Description**: ${def.function.description}`);
    sections.push(`**Parameters**:`);
    sections.push("```json");
    sections.push(JSON.stringify(def.function.parameters, null, 2));
    sections.push("```\n");
  }

  return sections.join("\n");
}

/**
 * Génère le format de réponse attendu
 */
export function generateResponseFormat(): string {
  return `
# 📋 RESPONSE FORMAT

You MUST respond with a JSON object (and ONLY JSON, no markdown, no explanations outside the JSON):

\`\`\`json
{
  "mode": "parallel" | "sequential",
  "actions": [
    { "tool": "tool_name", "args": { "param": "value" } },
    { "tool": "another_tool", "args": { ... } }
  ],
  "reasoning": "Optional: Your thought process (only if reasoning enabled)"
}
\`\`\`

## Execution Modes:

**parallel**: All actions are executed simultaneously (use for independent tasks)
- Example: Creating multiple files, adding multiple todos
- ✅ \`{ "mode": "parallel", "actions": [{"tool": "file", ...}, {"tool": "file", ...}] }\`

**sequential**: Actions are executed one by one (use when actions depend on previous results)
- Example: Read file → Update file → Execute file
- ✅ \`{ "mode": "sequential", "actions": [{"tool": "file", "args": {"action": "read", ...}}] }\`

## Critical Rules:

1. **ALWAYS return valid JSON** (no markdown, no text before/after)
2. **stop tool**: ONLY in sequential mode, either ALONE or LAST in the actions list
3. **Call stop when done**: After completing tasks or simple responses, include stop as last action
4. **Don't loop forever**: If you just said hello or completed all work → call stop
5. **send_message**: Use to communicate with user (greetings, updates, explanations)
`;
}

/**
 * Génère des exemples d'utilisation
 */
export function generateExamples(): string {
  return `
# 📚 EXAMPLES

## Example 1: Simple greeting (stop as last action)
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "send_message", "args": {} },
    { "tool": "stop", "args": {} }
  ]
}
\`\`\`

## Example 2: Create multiple files (parallel)
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "file", "args": { "action": "write", "filename": "index.html", "content": "..." } },
    { "tool": "file", "args": { "action": "write", "filename": "style.css", "content": "..." } },
    { "tool": "todo", "args": { "action": "add", "tasks": ["Create HTML", "Create CSS"] } },
    { "tool": "send_message", "args": {} }
  ]
}
\`\`\`

## Example 3: Update file (sequential - depends on read)
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "file", "args": { "action": "read", "filename": "app.js" } }
  ]
}
\`\`\`
Next iteration:
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "file", "args": { "action": "write", "filename": "app.js", "content": "updated..." } },
    { "tool": "send_message", "args": {} }
  ]
}
\`\`\`

## Example 4: Stop (alone, sequential)
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "stop", "args": {} }
  ]
}
\`\`\`
`;
}
