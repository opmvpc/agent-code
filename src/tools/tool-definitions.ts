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
 * Génère le format de réponse attendu (simplifié - pas de duplication avec SYSTEM_PROMPT_BASE)
 */
export function generateResponseFormat(): string {
  return `
# 📋 WORKFLOW BEST PRACTICES

1. **Use todo tool to plan**: For complex tasks, create todos to organize your work
2. **Speed first**: When in doubt about sequencing, GO PARALLEL - the loop will call you again
3. **Trust the loop**: You'll be called automatically after each iteration - don't overthink
4. **Smart parallelism**: HTML first, then CSS + JS together (they need HTML but not each other)
5. **Read tool results**: File operations return FULL content in message - it's in your conversation!
6. **Never re-read**: If you just created/read a file, the content is already in conversation history
7. **Edit is expensive**: Rewrites entire file - use only for major changes, not minor tweaks
8. **Independent assets in parallel**: Creating 3 SVG? Do all at once, not one by one
9. **Stop when done**: Just add \`{"tool": "stop"}\` to your actions - no complex rules!
`;
}

/**
 * Génère des exemples d'utilisation (workflows réalistes et variés)
 */
export function generateExamples(): string {
  return `
# 📚 WORKFLOW EXAMPLES

## Example 1: Simple Greeting (Baseline)
**User**: "Hello!"

**Iteration 1:**
\`\`\`json
{
  "mode": "sequential",
  "actions": [{ "tool": "send_message", "args": {} }]
}
\`\`\`
**Iteration 2:**
\`\`\`json
{"mode": "sequential", "actions": []}
\`\`\`

## Example 2: Create Website with SMART Parallelism
**User**: "Create a portfolio website with projects section"

**Iteration 1 (research + plan):**
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "websearch", "args": { "query": "modern portfolio website design 2024" } },
    { "tool": "todo", "args": { "action": "add", "tasks": ["Create HTML", "Create CSS + JS", "Test & polish"] } }
  ]
}
\`\`\`

**Iteration 2 (create HTML first - foundation for everything):**
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "file", "args": { "action": "write", "filename": "index.html", "instructions": "Portfolio: header with name/nav (class='nav-link'), hero section, projects grid (3 cards with class='project-card' and data-category), about, contact form (class='contact-form'). Use semantic HTML5, add IDs for sections." } }
  ]
}
\`\`\`
*Tool returns: Full HTML content in message - you can SEE all classes, IDs, structure!*

**Iteration 3 (NOW create CSS + JS in PARALLEL - they both depend on HTML but not each other):**
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "file", "args": { "action": "write", "filename": "style.css", "instructions": "Style based on HTML: modern design, CSS Grid for .project-card, animations for hero, responsive layout. Style header, nav-link, projects, contact-form." } },
    { "tool": "file", "args": { "action": "write", "filename": "script.js", "instructions": "Based on HTML: smooth scroll for .nav-link, filter projects by data-category, validate .contact-form, animate project-card on scroll" } }
  ]
}
\`\`\`
*Tool returns: Full CSS AND JS content - both created efficiently!*

**Iteration 4 (verify and finish):**
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "todo", "args": { "action": "clear" } },
    { "tool": "send_message", "args": {} },
    { "tool": "stop", "args": {} }
  ]
}
\`\`\`
**Note**: 4 iterations instead of 6! CSS + JS in parallel = faster.

## Example 3: Debug Existing Code
**User**: "The calculator app has a bug, it crashes on division"

**Iteration 1 (investigate - read + execute in parallel):**
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "file", "args": { "action": "read", "filename": "calculator.js" } },
    { "tool": "todo", "args": { "action": "add", "tasks": ["Find bug", "Fix bug", "Test fix"] } }
  ]
}
\`\`\`
**Iteration 2 (test to reproduce bug):**
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "execute", "args": { "code": "// Test division bug\nfunction divide(a, b) { return a / b; }\nconsole.log(divide(10, 0));" } }
  ]
}
\`\`\`
**Iteration 3 (fix the bug):**
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "file", "args": { "action": "edit", "filename": "calculator.js", "instructions": "Add division by zero check: if (b === 0) throw new Error('Cannot divide by zero')" } },
    { "tool": "todo", "args": { "action": "markasdone", "task": "Find bug" } },
    { "tool": "todo", "args": { "action": "markasdone", "task": "Fix bug" } }
  ]
}
\`\`\`
**Iteration 4 (verify fix):**
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "execute", "args": { "code": "// Verify fix works\nfunction divide(a, b) { if (b === 0) throw new Error('Cannot divide by zero'); return a / b; }\ntry { console.log(divide(10, 0)); } catch(e) { console.log('Caught:', e.message); }" } }
  ]
}
\`\`\`
**Iteration 5 (confirm + finish):**
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "todo", "args": { "action": "markasdone", "task": "Test fix" } },
    { "tool": "send_message", "args": {} },
    { "tool": "stop", "args": {} }
  ]
}
\`\`\`

## Example 4: Create Multiple Independent Assets (Perfect for Parallel!)
**User**: "Create 3 SVG icons: home, search, and settings"

**Iteration 1 (create ALL 3 in parallel - they're completely independent!):**
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "file", "args": { "action": "write", "filename": "icon-home.svg", "instructions": "Simple house icon, 24x24, minimalist line style, black stroke" } },
    { "tool": "file", "args": { "action": "write", "filename": "icon-search.svg", "instructions": "Magnifying glass icon, 24x24, matches home icon style" } },
    { "tool": "file", "args": { "action": "write", "filename": "icon-settings.svg", "instructions": "Gear/cog icon, 24x24, matches home and search icon style" } }
  ]
}
\`\`\`
*Tool returns: All 3 SVG contents in parallel - super efficient!*

**Iteration 2 (verify and finish):**
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "send_message", "args": {} },
    { "tool": "stop", "args": {} }
  ]
}
\`\`\`
**Note**: 2 iterations total! When assets are independent, create them all at once.

## Example 5: Anti-patterns to AVOID
**❌ BAD: Reading same file multiple times**
\`\`\`json
// Iteration 1: read index.html
// Iteration 2: read index.html AGAIN (why?!)
// The content is in tool result from iteration 1!
\`\`\`

**❌ BAD: Creating HTML + CSS + JS all in parallel**
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "file", "args": { "action": "write", "filename": "index.html", "instructions": "..." } },
    { "tool": "file", "args": { "action": "write", "filename": "style.css", "instructions": "..." } },  // Can't see HTML classes!
    { "tool": "file", "args": { "action": "write", "filename": "script.js", "instructions": "..." } }   // Can't see HTML structure!
  ]
}
\`\`\`

**❌ BAD: Editing file multiple times in a row**
\`\`\`json
// Iteration 1: edit index.html (add class)
// Iteration 2: edit index.html AGAIN (add another class)
// Iteration 3: edit index.html AGAIN (fix typo)
// Edit is expensive! Plan better and do it once.
\`\`\`

**✅ GOOD: HTML first, then CSS + JS in parallel**
\`\`\`json
// Iteration 1: create index.html (see full content in tool result)
// Iteration 2: create style.css + script.js in PARALLEL (both use HTML from iteration 1)
\`\`\`

## 🎯 KEY PRINCIPLES (How to Think Like Cursor's Claude):

1. **SPEED: Maximize parallelism, trust the loop**
   - When unsure about sequencing → GO PARALLEL for speed
   - You'll be called again automatically - don't do everything in one iteration
   - It's faster to do 2-3 parallel actions twice than 6 sequential actions once
   - The agentic loop is your friend - use it!

2. **Smart parallelism**
   - HTML first → then CSS + JS in PARALLEL (both need HTML, but not each other)
   - Multiple independent assets (3 SVG) → create ALL in parallel
   - Don't create HTML + CSS + JS all at once - CSS needs HTML structure first!

3. **Tool results contain FULL content in message**
   - When you read/create/edit a file, the COMPLETE content is in the tool message
   - This is added to conversation history - you can SEE it in next iteration
   - NEVER read the same file twice - it's already in your conversation!
   - Use the content from tool results to make informed decisions

4. **Edit is expensive - use carefully**
   - Edit rewrites the ENTIRE file (like creating from scratch)
   - Only use for major user-requested changes or critical bugs
   - Don't edit same file 3 times in a row - plan better!

5. **Research before creating** - Use websearch for accurate, up-to-date info

6. **Iterative is OK** - Taking 4-6 iterations for quality work is normal and expected
`;
}
