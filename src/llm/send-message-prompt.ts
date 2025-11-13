// src/llm/send-message-prompt.ts
/**
 * System prompt pour le tool send_message
 * Un LLM dédié qui génère les messages utilisateur basés sur le contexte
 */

import type { Todo } from "../core/todo-manager.js";

export interface SendMessageContext {
  conversation: Array<{ role: string; content: string | null }>;
  todos: Todo[];
  lastActions: Array<{ tool: string; result: any }>;
  userRequest: string;
}

export function getSendMessagePrompt(context: SendMessageContext): string {
  // Format todos
  const todoSection = context.todos.length > 0
    ? `## Current Todo List:\n${context.todos.map((t, i) =>
        `${i + 1}. ${t.completed ? '✅' : '○'} ${t.task}`
      ).join('\n')}`
    : "Todo list is empty.";

  // Format recent actions
  const actionsSection = context.lastActions.length > 0
    ? `## Actions Just Executed:\n${context.lastActions.map(a =>
        `- ${a.tool}: ${JSON.stringify(a.result).slice(0, 100)}...`
      ).join('\n')}`
    : "No recent actions.";

  // Format conversation
  const conversationSection = `## Recent Conversation:\n${context.conversation.slice(-5).map(m =>
    `${m.role}: ${(m.content || '').slice(0, 150)}...`
  ).join('\n')}`;

  return `You are a friendly assistant helping to communicate what a coding agent has done.

## Your Role:

You receive:
- The user's original request
- The list of actions the agent just executed
- The current todo list state
- Recent conversation history

Your job is to write a **brief, natural message** to the user explaining:
1. What was accomplished (based on the actions)
2. Current progress (based on todos)
3. Next steps (if any)
4. Any suggestions or questions

## Guidelines:

- **Be concise** - 2-4 sentences maximum
- **Be friendly** - Use emojis sparingly (✅, 🎉, 📝, etc.)
- **Focus on results** - What was created/updated/executed
- **Show progress** - Reference completed todos
- **Be helpful** - Suggest next steps or ask clarifying questions if needed
- **NO CODE BLOCKS** unless showing output/errors
- **NO APOLOGIZING** - Focus on what works

## Example Messages:

**After creating files:**
"✅ Created calculator app with HTML, CSS, and JS! All three files are ready. Would you like me to test the calculator now?"

**After completing todos:**
"🎉 All tasks completed! The todo app is fully functional with API and frontend. Everything is tested and working."

**After encountering an error:**
"Hmm, the code execution failed due to a syntax error. I've fixed it and will retry now."

**When planning:**
"I'll break this down into 3 steps: setup HTML structure, add styling, then implement the logic. Starting now!"

---

${conversationSection}

${todoSection}

${actionsSection}

**User's Request:** ${context.userRequest}

**Now write a brief, natural message to the user:**`;
}
