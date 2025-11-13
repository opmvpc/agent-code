# Unified Todo Tool 🎯

## Overview

Le tool `todo` est maintenant **unifié** avec un paramètre `action` pour toutes les opérations de todolist!

## Why Unified?

**Avant** (4 tools séparés):
```typescript
add_todo({ tasks: "Task 1" })       // Tool 1
complete_todo({ task: "Task 1" })   // Tool 2
list_todos()                         // Tool 3
clear_todos()                        // Tool 4
```

**Maintenant** (1 tool unifié):
```typescript
todo({ action: "add", tasks: "Task 1" })
todo({ action: "markasdone", task: "Task 1" })
todo({ action: "delete", task: "Task 1" })
todo({ action: "reset" })
```

### Benefits:

1. **🎯 Simpler**: Un seul tool au lieu de 4
2. **💰 Cheaper**: Moins de tokens dans le tool schema
3. **🧠 Clearer**: L'agent comprend mieux l'intention
4. **📊 Consistent**: API unifiée et cohérente
5. **🔧 Maintainable**: Un seul endroit pour la logique todo

## API Reference

### Action: `add`

Ajouter une ou plusieurs tâches à la todolist.

**Parameters:**
- `action`: `"add"` (required)
- `tasks`: `string | string[]` (required)

**Examples:**

```typescript
// Single task
todo({
  action: "add",
  tasks: "Create HTML structure"
})

// Multiple tasks (batch!)
todo({
  action: "add",
  tasks: [
    "Create HTML structure",
    "Style with CSS",
    "Add JavaScript functionality"
  ]
})
```

**Response:**
```json
{
  "success": true,
  "action": "add",
  "added": 3,
  "tasks": ["Create HTML structure", "Style with CSS", "Add JavaScript functionality"],
  "stats": { "total": 3, "completed": 0, "pending": 3 }
}
```

### Action: `markasdone`

Marquer une tâche comme complétée.

**Parameters:**
- `action`: `"markasdone"` (required)
- `task`: `string` (required)

**Example:**

```typescript
todo({
  action: "markasdone",
  task: "Create HTML structure"
})
```

**Response:**
```json
{
  "success": true,
  "action": "markasdone",
  "task": "Create HTML structure",
  "stats": { "total": 3, "completed": 1, "pending": 2 }
}
```

### Action: `delete`

Supprimer une tâche de la todolist.

**Parameters:**
- `action`: `"delete"` (required)
- `task`: `string` (required)

**Example:**

```typescript
todo({
  action: "delete",
  task: "Unwanted task"
})
```

**Response:**
```json
{
  "success": true,
  "action": "delete",
  "task": "Unwanted task",
  "stats": { "total": 2, "completed": 1, "pending": 1 }
}
```

### Action: `reset`

Effacer toutes les tâches de la todolist.

**Parameters:**
- `action`: `"reset"` (required)

**Example:**

```typescript
todo({
  action: "reset"
})
```

**Response:**
```json
{
  "success": true,
  "action": "reset",
  "cleared": 3,
  "message": "Cleared 3 todos"
}
```

## Complete Workflow Example

```typescript
// 1. Add tasks (batch)
await todo({
  action: "add",
  tasks: [
    "Setup project structure",
    "Create HTML boilerplate",
    "Style the UI",
    "Add interactivity",
    "Test everything"
  ]
});
// Stats: { total: 5, completed: 0, pending: 5 }

// 2. Mark some as done
await todo({ action: "markasdone", task: "Setup project structure" });
await todo({ action: "markasdone", task: "Create HTML boilerplate" });
// Stats: { total: 5, completed: 2, pending: 3 }

// 3. Delete a task (change of plan)
await todo({ action: "delete", task: "Add interactivity" });
// Stats: { total: 4, completed: 2, pending: 2 }

// 4. Mark remaining as done
await todo({ action: "markasdone", task: "Style the UI" });
await todo({ action: "markasdone", task: "Test everything" });
// Stats: { total: 4, completed: 4, pending: 0 }

// 5. Reset for next project
await todo({ action: "reset" });
// Stats: { total: 0, completed: 0, pending: 0 }
```

## Error Handling

### Missing Required Parameters

```typescript
// Missing tasks for 'add'
todo({ action: "add" })
// => { success: false, error: "tasks parameter is required for 'add' action" }

// Missing task for 'markasdone'
todo({ action: "markasdone" })
// => { success: false, error: "task parameter is required for 'markasdone' action" }
```

### Invalid Action

```typescript
todo({ action: "invalid" })
// => { success: false, error: "Unknown action: invalid. Use 'add', 'delete', 'markasdone', or 'reset'." }
```

### Task Not Found

```typescript
todo({ action: "markasdone", task: "Non-existent task" })
// => { success: false, error: "Task not found: Non-existent task" }

todo({ action: "delete", task: "Non-existent task" })
// => { success: false, error: "Task not found: Non-existent task" }
```

### Invalid Tasks Type

```typescript
todo({ action: "add", tasks: 123 })
// => { success: false, error: "tasks must be a string or an array of strings" }
```

## TodoManager Methods

Le tool utilise le `TodoManager` qui expose:

```typescript
class TodoManager {
  addTodo(task: string): void
  addTodos(tasks: string[]): void
  completeTodo(task: string): boolean
  deleteTodo(task: string): boolean
  listTodos(): Todo[]
  getStats(): { total: number; completed: number; pending: number }
  clearTodos(): void
  displayTodos(): string
}
```

## Migration Guide

Si vous aviez des appels aux anciens tools:

```typescript
// Avant
add_todo({ task: "Task 1" })
add_todo({ task: "Task 2" })
complete_todo({ task: "Task 1" })
list_todos()
clear_todos()

// Maintenant
todo({ action: "add", tasks: ["Task 1", "Task 2"] })  // Batch!
todo({ action: "markasdone", task: "Task 1" })
// (list n'est plus un tool, l'agent peut voir les todos dans sa mémoire)
todo({ action: "reset" })
```

## Schema (OpenAI Format)

```json
{
  "type": "function",
  "function": {
    "name": "todo",
    "description": "Manage your internal todo list. Supports add, delete, markasdone, and reset actions.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": ["add", "delete", "markasdone", "reset"],
          "description": "Action to perform"
        },
        "tasks": {
          "oneOf": [
            { "type": "string" },
            { "type": "array", "items": { "type": "string" } }
          ],
          "description": "Task(s) to add (for 'add' action)"
        },
        "task": {
          "type": "string",
          "description": "Task to delete or mark as done (for 'delete' and 'markasdone' actions)"
        }
      },
      "required": ["action"]
    }
  }
}
```

## Best Practices

1. **Use Batch Add**: Quand vous planifiez, ajoutez tous les todos en un seul call
2. **Mark as Done**: Marquez les tâches complétées au fur et à mesure
3. **Delete Sparingly**: Ne supprimez que si vous changez vraiment de plan
4. **Reset at End**: Réinitialisez quand vous commencez un nouveau projet

## Performance Comparison

**Before (4 separate tools):**
```
Tool Schema Size: ~800 tokens
Planning Phase: 3 tool calls (add x3)
Completion Phase: 3 tool calls (complete x3)
Total: 6 tool calls
```

**After (1 unified tool):**
```
Tool Schema Size: ~400 tokens (50% reduction!)
Planning Phase: 1 tool call (batch add)
Completion Phase: 3 tool calls (markasdone x3)
Total: 4 tool calls (33% reduction!)
```

---

**Note**: Cette architecture unifiée est inspirée des meilleures pratiques de design d'API (action-based routing) et réduit significativement la complexité pour l'agent! 🚀
