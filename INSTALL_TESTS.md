# Installation des Tests 🧪

## 1. Installer les dépendances

```bash
npm install --save-dev vitest @vitest/coverage-v8 @vitest/ui
```

## 2. Créer le fichier de config de test

Copier `.env.test.example` vers `.env.test`:

```bash
cp .env.test.example .env.test
```

Puis éditer `.env.test` et ajouter votre clé API:

```bash
OPENROUTER_API_KEY=sk-or-v1-VOTRE_CLE_ICI
TEST_MODEL=openai/gpt-oss-120b
TEMPERATURE=1.0
DEBUG=false
STORAGE_ENABLED=false
```

## 3. Lancer les tests

### Tests rapides (unitaires seulement)

```bash
npx vitest test/tools/
```

### Tous les tests (incluant intégration avec LLM)

```bash
npm test
```

### Watch mode (re-run automatique)

```bash
npm run test:watch
```

### Avec UI interactive

```bash
npm run test:ui
```

### Avec coverage

```bash
npm run test:coverage
```

## Structure créée

```
📦 agent-code/
├── vitest.config.ts              # Config Vitest
├── .env.test.example             # Template config test
├── .env.test                     # Ta config (à créer, gitignored)
├── test/
│   ├── setup.ts                  # Setup global (charge .env.test)
│   ├── tools/
│   │   └── tool-registry.test.ts # Tests unitaires du registry
│   ├── integration/
│   │   └── agent-tools.test.ts   # Tests d'intégration avec LLM
│   └── README.md                 # Doc complète des tests
├── TESTING.md                    # Guide de test
└── INSTALL_TESTS.md              # Ce fichier!
```

## Tests créés

### 1. Tests unitaires (rapides ⚡)

**`test/tools/tool-registry.test.ts`**

- ✅ Vérifie que les 14 tools sont enregistrés
- ✅ Vérifie les noms des tools
- ✅ Vérifie les définitions pour l'API
- ✅ Teste l'exécution avec mock agent

### 2. Tests d'intégration (lents 🐌 + coûteux 💰)

**`test/integration/agent-tools.test.ts`**

- 🔥 Test 1: "planifie dans ta todolist la creation d'une calculatrice en html css js"
  - Vérifie que l'IA répond avec des tool calls
  - Vérifie que des todos sont créés
- 🔥 Test 2: Création de 3 todos spécifiques
  - Vérifie le parsing de multiples tool calls
- 🔥 Test 3: Création d'un fichier test.js
  - Vérifie le flow complet de création de fichier

## Exemple de sortie attendue

```bash
$ npm test

 ✓ test/tools/tool-registry.test.ts (7)
   ✓ should have all 14 tools registered
   ✓ should have correct tool names
   ✓ should return tool definitions for API
   ✓ should get a tool by name
   ✓ should return undefined for unknown tool
   ✓ should execute a tool successfully
   ✓ should handle unknown tool execution

 ✓ test/integration/agent-tools.test.ts (3)
   ✓ should return tool calls when asked to plan a calculator project
     ✅ Agent created 5 todos:
        1. Create HTML structure with calculator layout
        2. Style calculator with CSS
        3. Implement basic calculator logic in JavaScript
        4. Add event listeners for button clicks
        5. Test all calculator operations
   ✓ should parse multiple tool calls correctly
     ✅ Agent created 3 todos via multiple tool calls
   ✓ should handle file creation via tools
     ✅ Agent created test.js with content

 Test Files  2 passed (2)
      Tests  10 passed (10)
   Duration  ~27s
```

## Troubleshooting

### ❌ "OPENROUTER_API_KEY not set"

Solution: Créer `.env.test` avec ta clé API.

### ❌ Tests timeout

Solution: Augmenter le timeout dans `vitest.config.ts` ou utiliser un modèle plus rapide.

### ❌ Import errors

Solution: Vérifier que `"type": "module"` est dans `package.json`.

### ❌ Coverage ne fonctionne pas

Solution: Installer `@vitest/coverage-v8`:

```bash
npm install --save-dev @vitest/coverage-v8
```

## Next Steps

1. **Run les tests:**

   ```bash
   npm test
   ```

2. **Vérifier le coverage:**

   ```bash
   npm run test:coverage
   open coverage/index.html
   ```

3. **Ajouter de nouveaux tests** pour tes features!

---

**Note:** Les tests d'intégration font de **vrais appels LLM** et consomment des tokens.
On utilise `gpt-oss-120b` qui est rapide et pas cher (~$0.50/1M tokens), donc ça coûte pratiquement rien! 💰
