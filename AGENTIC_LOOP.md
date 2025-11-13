# Agentic Loop Architecture 🔄

## Overview

Notre agent fonctionne en **boucle itérative** avec support natif du **parallel tool calling** d'OpenRouter.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USER REQUEST                         │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│              ITERATION 1                                │
│  LLM Analyzes → Calls MULTIPLE tools in parallel       │
│  Example: add_todo + add_todo + write_file             │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│          TOOLS EXECUTED IN PARALLEL                     │
│  All independent tools run simultaneously               │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│              ITERATION 2                                │
│  LLM receives results → Calls next batch of tools      │
│  Example: execute_code + complete_todo                 │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
                  ...
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│              ITERATION N                                │
│  LLM finishes all work → Calls stop                    │
└─────────────────────────────────────────────────────────┘
```

## Parallel vs Sequential Tool Execution

### ✅ Parallel Execution (Same Iteration)

**Criteria**: Tools that DON'T depend on each other

**Examples**:
- Creating multiple independent files
- Adding multiple todos
- Reading multiple unrelated files
- Completing multiple finished tasks

```typescript
// Iteration 1: ALL AT ONCE
[
  write_file("index.html", "..."),
  write_file("styles.css", "..."),
  write_file("app.js", "..."),
  add_todo("Test the app"),
]
```

### ❌ Sequential Execution (Across Iterations)

**Criteria**: Tools that DEPEND on previous results

**Examples**:
- Read file → Edit file (need content first)
- Write file → Execute file (need file to exist)
- Check results → Decide next action

```typescript
// Iteration 1: Read first
[read_file("config.js")]

// Iteration 2: Now we can edit (we have the content)
[write_file("config.js", "...updated...")]

// Iteration 3: Now we can test (file is updated)
[execute_code("config.js")]
```

## OpenRouter Streaming Implementation

Notre implémentation parse correctement les tool calls en streaming selon la doc OpenRouter:

```typescript
// src/llm/openrouter.ts (lines 296-332)

// Les tool calls arrivent en fragments via delta.tool_calls
if (delta?.tool_calls) {
  for (const toolCallDelta of delta.tool_calls) {
    const index = toolCallDelta.index;

    if (!toolCallsMap.has(index)) {
      // New tool call
      toolCallsMap.set(index, {
        id: toolCallDelta.id || "",
        type: "function",
        function: {
          name: toolCallDelta.function?.name || "",
          arguments: toolCallDelta.function?.arguments || "",
        },
      });
    } else {
      // Append fragments
      const existing = toolCallsMap.get(index);
      if (toolCallDelta.function?.name) {
        existing.function.name += toolCallDelta.function.name;
      }
      if (toolCallDelta.function?.arguments) {
        existing.function.arguments += toolCallDelta.function.arguments;
      }
    }
  }
}
```

### Key Features:

1. **Accumulation par index**: Chaque tool call est accumulé dans une Map par son `index`
2. **Concaténation de fragments**: Les `name` et `arguments` sont concaténés au fur et à mesure
3. **Yield final**: Les tool calls complets sont yield une fois le stream terminé

## Configuration

### Enable Parallel Tool Calls

```typescript
// src/llm/openrouter.ts
requestBody.parallel_tool_calls = true; // ✅ Activé!
```

### System Prompt

Le prompt explique clairement à l'agent:
- La boucle itérative
- Quand utiliser parallèle vs séquentiel
- Des exemples concrets
- Le workflow avec `stop`

```typescript
// src/llm/prompts.ts
export const SYSTEM_PROMPT = `
## HOW YOU WORK (Agentic Loop with Parallel Execution):

You operate in an **iterative loop** where each iteration allows
you to execute multiple tools in parallel:

1. Plan → Use add_todo to break down work
2. Execute in Parallel → Call ALL independent tools in ONE response
3. Sequential Work → If dependent, execute in NEXT iteration
4. Loop Continues → You're called again automatically
5. Finish → Call stop when done
...
`;
```

## Agent Implementation

### Main Loop

```typescript
// src/core/agent.ts (simplified)

async processRequest(userMessage: string) {
  let iteration = 0;
  const maxIterations = 50;

  while (iteration < maxIterations) {
    iteration++;

    // Call LLM with streaming
    const stream = this.llmClient.chatStream(messages);

    let toolCalls = [];
    for await (const chunk of stream) {
      if (chunk.type === "tool_calls") {
        toolCalls = chunk.tool_calls;
      }
    }

    // Execute ALL tool calls in parallel
    const results = await Promise.all(
      toolCalls.map(call => this.executeTool(call))
    );

    // Check if agent called stop
    if (results.some(r => r.stopped)) {
      break;
    }

    // Add results to conversation and loop
    messages.push(...results);
  }
}
```

### Tool Registry

Le `ToolRegistry` route l'exécution:

```typescript
// src/tools/tool-registry.ts

async execute(name: string, args: Record<string, any>, agent: Agent) {
  const tool = this.getTool(name);
  if (!tool) {
    return { success: false, error: `Unknown tool: ${name}` };
  }

  return await tool.execute(args, agent);
}
```

## Benefits

1. **🚀 Performance**: Parallel execution = faster completion
2. **🧠 Smart Planning**: Agent optimizes tool usage
3. **📊 Clear Structure**: Iterative loop easy to debug
4. **🔄 Flexible**: Handles both simple and complex tasks
5. **✅ Standards-compliant**: Uses OpenRouter native tool calling

## Debugging

### Verbose Mode

```bash
DEBUG=verbose npm start
```

Shows:
- Each iteration number
- Tool calls requested
- Tool execution results
- Token usage per iteration

### Logs

```bash
tail -f logs/agent.log
```

All tool calls and executions are logged with Winston.

## Example Workflows

### Example 1: Independent Files (Parallel)

```
User: "Create a website with HTML, CSS, and JS"

Iteration 1:
  → write_file("index.html", "...")
  → write_file("styles.css", "...")
  → write_file("app.js", "...")
  → add_todo("Test the website")
  [4 tools in parallel]

Iteration 2:
  → complete_todo("Test the website")
  → stop
```

### Example 2: Dependent Tasks (Sequential)

```
User: "Update config.js to add a new setting"

Iteration 1:
  → read_file("config.js")
  [Must read first]

Iteration 2:
  → write_file("config.js", "...updated...")
  [Now we can write with updated content]

Iteration 3:
  → stop
```

### Example 3: Complex Project (Mixed)

```
User: "Create a calculator with tests"

Iteration 1 (Planning):
  → add_todo("Create calculator.js")
  → add_todo("Create tests.js")
  → add_todo("Run tests")
  [3 parallel]

Iteration 2 (Creation):
  → write_file("calculator.js", "...")
  → write_file("tests.js", "...")
  → complete_todo("Create calculator.js")
  → complete_todo("Create tests.js")
  [4 parallel]

Iteration 3 (Testing):
  → execute_code("tests.js")
  [Sequential - needs files to exist]

Iteration 4 (Finish):
  → complete_todo("Run tests")
  → stop
```

## Best Practices

1. **Maximize Parallelism**: Call all independent tools at once
2. **Use TodoList**: For complex multi-step tasks
3. **Read Before Edit**: Always `read_file` before `write_file`
4. **Clear Stop**: Only call `stop` when truly done
5. **Error Handling**: Tools return structured errors for agent to handle

## References

- [OpenRouter Tool Calling Docs](https://openrouter.ai/docs/features/tool-calling)
- [OpenRouter Streaming](https://openrouter.ai/docs/features/tool-calling#streaming-with-tool-calls)
- [Parallel Tool Calls](https://openrouter.ai/docs/features/tool-calling#parallel-tool-calls)

---

**Note**: L'agent a été conçu pour **maximiser le parallélisme** tout en respectant les dépendances. C'est la clé de sa performance! 🚀
