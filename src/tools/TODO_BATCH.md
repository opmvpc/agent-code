# Batch Todo Support 🎯

## Overview

Le tool `add_todo` supporte maintenant l'ajout de **plusieurs tâches en une seule fois**!

## Why?

**Avant** (inefficient):
```typescript
// 3 tool calls séparés
add_todo({ task: "Create HTML" })
add_todo({ task: "Create CSS" })
add_todo({ task: "Create JS" })
```

**Maintenant** (efficient):
```typescript
// 1 seul tool call!
add_todo({
  tasks: ["Create HTML", "Create CSS", "Create JS"]
})
```

## API

### Single Task (backward compatible)

```typescript
add_todo({ tasks: "Single task description" })
```

**Response:**
```json
{
  "success": true,
  "added": 1,
  "task": "Single task description",
  "stats": { "total": 1, "completed": 0, "pending": 1 }
}
```

### Multiple Tasks (new!)

```typescript
add_todo({
  tasks: [
    "First task",
    "Second task",
    "Third task"
  ]
})
```

**Response:**
```json
{
  "success": true,
  "added": 3,
  "tasks": ["First task", "Second task", "Third task"],
  "stats": { "total": 3, "completed": 0, "pending": 3 }
}
```

## Schema

```typescript
{
  name: "add_todo",
  parameters: {
    tasks: {
      oneOf: [
        { type: "string" },           // Single task
        {
          type: "array",               // Multiple tasks
          items: { type: "string" }
        }
      ]
    }
  }
}
```

## Benefits

1. **⚡ Faster**: Moins d'appels API
2. **💰 Cheaper**: Moins de tokens consommés
3. **🧠 Cleaner**: Code plus lisible
4. **📊 Efficient**: Réduit la latence

## Examples

### Planning a Project

```typescript
// Avant: 5 tool calls
add_todo("Create index.html")
add_todo("Create styles.css")
add_todo("Create app.js")
add_todo("Add tests")
add_todo("Deploy")

// Maintenant: 1 tool call
add_todo([
  "Create index.html",
  "Create styles.css",
  "Create app.js",
  "Add tests",
  "Deploy"
])
```

### Mixed Usage

Vous pouvez toujours utiliser les deux:

```typescript
// Single task
add_todo("Quick task")

// Batch tasks
add_todo([
  "Complex task 1",
  "Complex task 2",
  "Complex task 3"
])
```

## Implementation

### TodoManager

```typescript
// src/core/todo-manager.ts

// Single task (existing)
addTodo(task: string): void {
  this.todos.push({
    task,
    completed: false,
    createdAt: new Date(),
  });
}

// Batch tasks (new!)
addTodos(tasks: string[]): void {
  const now = new Date();
  for (const task of tasks) {
    this.todos.push({
      task,
      completed: false,
      createdAt: now,
    });
  }
}
```

### Tool

```typescript
// src/tools/todo-tools.ts

async execute(args: Record<string, any>, agent: Agent) {
  const { tasks } = args;

  if (typeof tasks === "string") {
    // Single task
    agent.getTodoManager().addTodo(tasks);
    return { success: true, added: 1, task: tasks };
  }

  if (Array.isArray(tasks)) {
    // Multiple tasks
    agent.getTodoManager().addTodos(tasks);
    return { success: true, added: tasks.length, tasks };
  }

  return {
    success: false,
    error: "tasks must be string or array"
  };
}
```

## Updated System Prompt

Le prompt a été mis à jour pour encourager l'usage batch:

```
**Iteration 1** (Planning):
- ✅ add_todo([
    "Create HTML structure",
    "Style with CSS",
    "Add JS functionality"
  ])
→ 1 tool call for all todos!
```

## Backward Compatibility

✅ **100% backward compatible!**

L'ancien usage fonctionne toujours:
```typescript
add_todo({ task: "Single task" })  // ✅ Still works
```

Le nouveau usage est optionnel:
```typescript
add_todo({ tasks: ["Task 1", "Task 2"] })  // ✅ New feature
```

## Testing

```typescript
// Test single task
const result1 = await addTodoTool.execute(
  { tasks: "Test task" },
  agent
);
expect(result1.added).toBe(1);

// Test batch tasks
const result2 = await addTodoTool.execute(
  { tasks: ["Task 1", "Task 2", "Task 3"] },
  agent
);
expect(result2.added).toBe(3);
```

---

**Pro tip**: Utilisez le batch mode quand vous planifiez plusieurs étapes! C'est beaucoup plus efficace! 🚀
