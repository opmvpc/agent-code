# Tests 🧪

Tests pour vérifier que le système de tools fonctionne correctement.

## Setup

1. **Installer les dépendances de test:**

```bash
npm install
```

2. **Créer `.env.test`:**

```bash
cp .env.test.example .env.test
```

Puis ajouter votre clé API OpenRouter dans `.env.test`.

## Lancer les tests

```bash
# Run all tests
npm test

# Watch mode (re-run on changes)
npm run test:watch

# With coverage report
npm run test:coverage

# With UI
npm run test:ui
```

## Structure des tests

```
test/
├── setup.ts                    # Setup global (charge .env.test)
├── tools/
│   └── tool-registry.test.ts   # Tests unitaires du registry
└── integration/
    └── agent-tools.test.ts     # Tests d'intégration avec LLM
```

## Types de tests

### 1. Tests unitaires (`test/tools/`)

Tests rapides qui ne font **pas** d'appels LLM:
- ✅ Vérifier que tous les tools sont enregistrés
- ✅ Vérifier les définitions des tools
- ✅ Vérifier l'exécution avec mock agent

### 2. Tests d'intégration (`test/integration/`)

Tests qui font des **vrais appels LLM**:
- 🔥 Vérifier que l'IA répond avec des tool calls
- 🔥 Vérifier que les tools sont exécutés correctement
- 🔥 Vérifier le flow complet agent -> LLM -> tools -> résultat

**⚠️ Ces tests consomment des tokens!** (mais on utilise gpt-oss qui est cheap)

## Configuration

Variables d'environnement dans `.env.test`:

```bash
OPENROUTER_API_KEY=sk-or-...     # Requis
TEST_MODEL=thedrummer/gpt-oss-120b  # Modèle pour tests (rapide + cheap)
TEMPERATURE=1.0
DEBUG=false
STORAGE_ENABLED=false             # Désactiver pour éviter side effects
```

## Exemple de sortie

```bash
$ npm test

✓ test/tools/tool-registry.test.ts (7)
  ✓ ToolRegistry (7)
    ✓ should have all 14 tools registered
    ✓ should have correct tool names
    ✓ should return tool definitions for API
    ✓ should get a tool by name
    ✓ should return undefined for unknown tool
    ✓ should execute a tool successfully
    ✓ should handle unknown tool execution

✓ test/integration/agent-tools.test.ts (3)
  ✓ Agent Tool Calling Integration (3)
    ✓ should return tool calls when asked to plan a calculator project (12.5s)
      ✅ Agent created 5 todos:
         1. Create HTML structure
         2. Style with CSS
         3. Implement JS calculator logic
         4. Add event listeners
         5. Test all operations
    ✓ should parse multiple tool calls correctly (8.2s)
      ✅ Agent created 3 todos via multiple tool calls
    ✓ should handle file creation via tools (6.1s)
      ✅ Agent created test.js with content

Test Files  2 passed (2)
     Tests  10 passed (10)
  Start at  14:23:42
  Duration  27.18s (transform 142ms, setup 0ms, collect 1.21s, tests 26.8s)
```

## Tips

1. **Limiter les appels LLM:**
   - Les tests d'intégration sont lents et coûteux
   - Utilisez `it.skip()` pour désactiver temporairement
   - Utilisez des mocks quand possible

2. **Debugging:**
   ```bash
   DEBUG=true npm test
   ```

3. **Tester un seul fichier:**
   ```bash
   npx vitest test/tools/tool-registry.test.ts
   ```

4. **Coverage:**
   - Le rapport HTML est généré dans `coverage/`
   - Ouvrez `coverage/index.html` dans un navigateur

## Ajouter de nouveaux tests

### Test unitaire d'un tool

```typescript
// test/tools/my-tool.test.ts
import { describe, it, expect } from "vitest";
import { MyTool } from "../../src/tools/my-tool.js";

describe("MyTool", () => {
  it("should execute correctly", async () => {
    const tool = new MyTool();
    const mockAgent = { /* ... */ } as Agent;

    const result = await tool.execute({ arg: "value" }, mockAgent);

    expect(result.success).toBe(true);
  });
});
```

### Test d'intégration avec LLM

```typescript
// test/integration/my-feature.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { Agent } from "../../src/core/agent.js";

describe("My Feature", () => {
  let agent: Agent;

  beforeAll(() => {
    agent = new Agent({
      apiKey: process.env.OPENROUTER_API_KEY!,
      model: "thedrummer/gpt-oss-120b",
      storage: { enabled: false },
    });
  });

  it("should do something", async () => {
    const result = await agent.processRequest("test message");
    expect(result).toBeDefined();
  }, 60000); // 60s timeout
});
```

---

**Pro tip:** Lance `npm run test:watch` pendant le dev pour avoir un feedback instantané! 🚀
