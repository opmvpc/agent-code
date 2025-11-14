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

1. **Work iteratively**: Create 1-3 files per iteration, not everything at once
2. **Read tool results**: File tool returns full content - use it for next actions
3. **Respect dependencies**: HTML → CSS → JS (sequential, not parallel)
4. **Plan multi-step tasks**: Use todo tool to track complex workflows
5. **Read before edit**: Check current content before modifying
6. **Communicate key milestones**: Use \`send_message\` after important operations
7. **Stop when done**: Return control to user after completing tasks or when needing input
8. **Don't over-optimize**: 6-10 iterations is normal for quality work
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

## Example 2: Create Website ITERATIVELY (Like Cursor!)
**User**: "Create a portfolio website with projects section"

**Iteration 1 (research + plan):**
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "websearch", "args": { "query": "modern portfolio website design 2024" } },
    { "tool": "todo", "args": { "action": "add", "tasks": ["Create HTML structure", "Style with CSS", "Add interactivity", "Polish"] } }
  ]
}
\`\`\`

**Iteration 2 (create HTML first - see the structure):**
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "file", "args": { "action": "write", "filename": "index.html", "instructions": "Portfolio site: header with name, navigation, hero section, projects grid (3 project cards with class 'project-card'), about section, contact form. Use semantic HTML5. Add IDs for navigation." } }
  ]
}
\`\`\`
*Tool returns HTML content - you can now see the structure, classes, IDs!*

**Iteration 3 (create CSS based on HTML you just saw):**
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "file", "args": { "action": "write", "filename": "style.css", "instructions": "Style the portfolio: modern design with CSS Grid for .project-card, smooth animations, responsive layout. Style the header, hero, projects grid, about section, and contact form that are in the HTML." } }
  ]
}
\`\`\`
*Tool returns CSS content - you can see the styling!*

**Iteration 4 (notice HTML needs adjustment - add classes for JS):**
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "file", "args": { "action": "edit", "filename": "index.html", "instructions": "Add class 'nav-link' to navigation links, add data-project attribute to project cards for filtering, add class 'contact-form' to form" } }
  ]
}
\`\`\`

**Iteration 5 (now create JS with full knowledge of HTML structure):**
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "file", "args": { "action": "write", "filename": "script.js", "instructions": "Add smooth scroll for .nav-link clicks, project filtering based on data-project attributes, form validation for .contact-form, scroll animations for project cards" } }
  ]
}
\`\`\`

**Iteration 6 (communicate + finish):**
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
**Note**: 6 iterations! That's normal - iterative development takes time.

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

## Example 4: Improve SVG Files (Anti-pattern Prevention!)
**User**: "Improve the existing SVG files"

**❌ BAD (reads same file multiple times):**
\`\`\`json
// Iteration 1: read car.svg
// Iteration 2: read car.svg AGAIN (wasteful!)
// Iteration 3: read car.svg AGAIN (why?!)
\`\`\`

**✅ GOOD (efficient approach):**
**Iteration 1 (list + read all at once):**
\`\`\`json
{
  "mode": "sequential",
  "actions": [
    { "tool": "file", "args": { "action": "list" } }
  ]
}
\`\`\`
**Iteration 2 (read all SVGs in parallel):**
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "file", "args": { "action": "read", "filename": "car.svg" } },
    { "tool": "file", "args": { "action": "read", "filename": "car2.svg" } },
    { "tool": "file", "args": { "action": "read", "filename": "car3.svg" } },
    { "tool": "todo", "args": { "action": "add", "tasks": ["Improve car.svg", "Improve car2.svg", "Improve car3.svg"] } }
  ]
}
\`\`\`
**Iteration 3 (edit all in parallel):**
\`\`\`json
{
  "mode": "parallel",
  "actions": [
    { "tool": "file", "args": { "action": "edit", "filename": "car.svg", "instructions": "Optimize SVG: remove redundant attributes, add viewBox, improve structure" } },
    { "tool": "file", "args": { "action": "edit", "filename": "car2.svg", "instructions": "Fix syntax errors, add proper SVG namespace, optimize paths" } },
    { "tool": "file", "args": { "action": "edit", "filename": "car3.svg", "instructions": "Enhance visual quality, add colors, optimize file size" } }
  ]
}
\`\`\`
**Iteration 4 (finish):**
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

## 🎯 KEY PRINCIPLES (How to Think Like Cursor's Claude):

1. **Work ITERATIVELY, not all at once**
   - Create 1-3 files per iteration, see results, then continue
   - Don't create HTML + CSS + JS in parallel - do them sequentially
   - You'll be called again after each iteration - USE THIS!

2. **Tool results contain FULL content**
   - When you create/edit a file, tool result includes the complete content
   - READ the tool results to inform your next actions
   - Use the content you just created to make smart decisions for next files

3. **Dependencies matter**
   - CSS depends on HTML classes/IDs → Create HTML first
   - JS depends on HTML structure → Create HTML and CSS first
   - Sometimes you need to GO BACK and edit HTML to add classes for CSS/JS

4. **Never read the same file twice** - You already have the content from tool results

5. **Research before creating** - Use websearch for context/information

6. **Test your changes** - Use execute to verify code works

7. **It's OK to take many iterations** - 6-10 iterations for a complete site is NORMAL
`;
}
