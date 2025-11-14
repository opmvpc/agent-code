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
2. **STOP THE LOOP when done**: Use stop tool OR return empty actions array
3. **stop tool**: ONLY in sequential mode, either ALONE or LAST in the actions list
4. **Empty actions**: \`{"mode": "sequential", "actions": []}\` also stops the loop
5. **Don't loop forever**: After finishing work → STOP IMMEDIATELY
6. **send_message**: Use to communicate with user (greetings, updates, explanations)

## 🛑 Two Ways to Stop:

**Option A: Stop tool (sequential, alone or last)**
\`\`\`json
{"mode": "sequential", "actions": [{"tool": "stop", "args": {}}]}
\`\`\`

**Option B: Empty actions array**
\`\`\`json
{"mode": "sequential", "actions": []}
\`\`\`
`;
}

/**
 * Génère des exemples d'utilisation
 */
export function generateExamples(): string {
  return `
# 📚 EXAMPLES

## Example 1: Simple greeting (send message + stop)
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "send_message", "args": {} },
    { "tool": "stop", "args": {} }
  ]
}
\`\`\`

## Example 2: Simple greeting (send message + empty actions next turn)
**Turn 1:**
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "send_message", "args": {} }
  ]
}
\`\`\`
**Turn 2 (stop with empty array):**
\`\`\`json
{
  "mode": "sequential",
  "actions": []
}
\`\`\`

## Example 3: Create multiple files (parallel + stop after)
**Turn 1:**
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "file", "args": { "action": "write", "filename": "index.html", "instructions": "..." } },
    { "tool": "file", "args": { "action": "write", "filename": "style.css", "instructions": "..." } },
    { "tool": "todo", "args": { "action": "add", "tasks": ["Create HTML", "Create CSS"] } },
    { "tool": "send_message", "args": {} }
  ]
}
\`\`\`
**Turn 2 (done, stop now!):**
\`\`\`json
{
  "mode": "sequential",
  "actions": []
}
\`\`\`

## Example 4: Update file (sequential - depends on read)
**Turn 1 (read first):**
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "file", "args": { "action": "read", "filename": "app.js" } }
  ]
}
\`\`\`
**Turn 2 (edit + message):**
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "file", "args": { "action": "edit", "filename": "app.js", "instructions": "updated..." } },
    { "tool": "send_message", "args": {} }
  ]
}
\`\`\`
**Turn 3 (STOP - work is done!):**
\`\`\`json
{
  "mode": "sequential",
  "actions": []
}
\`\`\`

## Example 5: Stop immediately (nothing to do)
\`\`\`json
{
  "mode": "sequential",
  "actions": []
}
\`\`\`

## Example 6: Stop with stop tool (alternative method)
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
