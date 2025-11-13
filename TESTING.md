# Guide de Test 🧪

## Installation

Installe les dépendances de test:

```bash
npm install
```

Ensuite copie `.env.test.example` vers `.env.test` et ajoute ta clé API:

```bash
cp .env.test.example .env.test
# Edit .env.test and add your OPENROUTER_API_KEY
```

## Commandes

```bash
# Run all tests
npm test

# Watch mode (re-run on save)
npm run test:watch

# Coverage report
npm run test:coverage

# Interactive UI
npm run test:ui
```

## Architecture des tests

```
test/
├── setup.ts                    # Setup global (charge .env.test)
├── tools/
│   └── tool-registry.test.ts   # Tests unitaires du registry
└── integration/
    └── agent-tools.test.ts     # Tests d'intégration avec LLM réel
```

### Tests unitaires (rapides ⚡)

Ne font **pas** d'appels LLM. Testent la logique pure:
- Registry de tools
- Exécution avec mock agent
- Validation des définitions

```bash
npx vitest test/tools/
```

### Tests d'intégration (lents 🐌)

Font des **vrais appels LLM**. Vérifient le comportement end-to-end:
- Agent répond avec tool calls
- Tools sont exécutés correctement
- Flow complet fonctionne

```bash
npx vitest test/integration/
```

**⚠️ Ces tests consomment des tokens!** (mais gpt-oss est cheap)

## Configuration

`.env.test`:

```bash
OPENROUTER_API_KEY=sk-or-...          # Requis
TEST_MODEL=thedrummer/gpt-oss-120b    # Modèle de test (rapide + pas cher)
TEMPERATURE=1.0
DEBUG=false
STORAGE_ENABLED=false                 # Évite side effects
```

## Example Output

```bash
$ npm test

 ✓ test/tools/tool-registry.test.ts (7) 245ms
   ✓ ToolRegistry (7) 244ms
     ✓ should have all 14 tools registered
     ✓ should have correct tool names
     ✓ should return tool definitions for API
     ✓ should get a tool by name
     ✓ should return undefined for unknown tool
     ✓ should execute a tool successfully
     ✓ should handle unknown tool execution

 ✓ test/integration/agent-tools.test.ts (3) 26842ms
   ✓ Agent Tool Calling Integration (3) 26841ms
     ✓ should return tool calls when asked to plan a calculator project (12456ms)
       ✅ Agent created 5 todos:
          1. Create HTML structure with calculator layout
          2. Style calculator with CSS
          3. Implement basic calculator logic in JavaScript
          4. Add event listeners for button clicks
          5. Test all calculator operations
     ✓ should parse multiple tool calls correctly (8234ms)
       ✅ Agent created 3 todos via multiple tool calls
     ✓ should handle file creation via tools (6151ms)
       ✅ Agent created test.js with content

 Test Files  2 passed (2)
      Tests  10 passed (10)
   Start at  14:23:42
   Duration  27.09s (transform 142ms, setup 1ms, collect 1.21s, tests 27.09s, environment 0ms, prepare 125ms)
```

## Tips

### 1. Skip slow tests pendant le dev

```typescript
it.skip("should call LLM", async () => {
  // Skipped during dev
});
```

### 2. Run un seul test

```bash
npx vitest test/tools/tool-registry.test.ts
```

### 3. Debug mode

```bash
DEBUG=true npm test
```

### 4. Watch un seul fichier

```bash
npx vitest test/tools/tool-registry.test.ts --watch
```

## Ajouter de nouveaux tests

### Test unitaire

```typescript
// test/tools/my-new-tool.test.ts
import { describe, it, expect } from "vitest";
import { MyNewTool } from "../../src/tools/my-new-tool.js";
import type { Agent } from "../../src/core/agent.js";

describe("MyNewTool", () => {
  it("should work correctly", async () => {
    const tool = new MyNewTool();

    // Mock minimal agent
    const mockAgent = {
      getVFS: () => ({ /* mock methods */ }),
    } as unknown as Agent;

    const result = await tool.execute({ param: "value" }, mockAgent);

    expect(result.success).toBe(true);
  });
});
```

### Test d'intégration

```typescript
// test/integration/my-feature.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { Agent } from "../../src/core/agent.js";

describe("My Feature Integration", () => {
  let agent: Agent;

  beforeAll(() => {
    agent = new Agent({
      apiKey: process.env.OPENROUTER_API_KEY!,
      model: "thedrummer/gpt-oss-120b",
      storage: { enabled: false },
    });
  });

  it("should work end-to-end", async () => {
    const result = await agent.processRequest("test this feature");

    expect(result).toBeDefined();
    // ... assertions
  }, 60000); // 60s timeout for LLM calls
});
```

## CI/CD

Pour GitHub Actions:

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm install

      # Unit tests only (fast, no API key needed)
      - run: npx vitest test/tools/ --run

      # Integration tests (require API key)
      - run: npm test
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

## Coverage

Génère un rapport de coverage:

```bash
npm run test:coverage
```

Ouvre `coverage/index.html` dans un navigateur pour voir le rapport HTML.

---

**Pro tip:** Lance `npm run test:watch` pendant le dev pour un feedback instantané! 🚀
