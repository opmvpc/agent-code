# Tools System Architecture 🛠️

## Overview

Le système de tools est maintenant **basé sur des classes** pour une meilleure maintenabilité et extensibilité.

## Architecture

```
src/tools/
├── base-tool.ts        # Interface et classe de base
├── tool-registry.ts    # Registry central
├── file-tools.ts       # Tools pour les fichiers
├── execution-tools.ts  # Tools pour l'exécution de code
├── todo-tools.ts       # Tools pour la todolist
├── control-tools.ts    # Tools de contrôle (send_message, stop)
├── project-tools.ts    # Tools de gestion de projets
└── index.ts            # Exports
```

## Comment créer un nouveau tool

### 1. Créer une classe qui extend `BaseTool`

```typescript
import { BaseTool, type ToolResult } from "./base-tool.js";
import type { Agent } from "../core/agent.js";

export class MyCustomTool extends BaseTool {
  // Nom unique du tool
  readonly name = "my_custom_tool";

  // Description pour le LLM
  readonly description = "What this tool does";

  // Définir le schema des paramètres
  protected getParametersSchema() {
    return {
      properties: {
        param1: {
          type: "string",
          description: "Description of param1",
        },
        param2: {
          type: "number",
          description: "Description of param2",
        },
      },
      required: ["param1"], // Paramètres obligatoires
    };
  }

  // Implémenter la logique
  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    // Valider les arguments requis
    this.validateArgs(args, ["param1"]);

    const { param1, param2 } = args;

    try {
      // Utiliser agent.getVFS(), agent.getMemory(), etc.
      // ... votre logique ici ...

      return {
        success: true,
        result: "some result",
        // ... autres données ...
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}
```

### 2. Enregistrer le tool dans le Registry

Dans `tool-registry.ts`:

```typescript
import { MyCustomTool } from "./my-custom-tools.js";

private registerDefaultTools(): void {
  // ... existing tools ...
  this.register(new MyCustomTool());
}
```

### 3. Exporter le tool

Dans `index.ts`:

```typescript
export * from "./my-custom-tools.js";
```

## Interfaces Principales

### `Tool`

Interface que tous les tools doivent implémenter:

```typescript
interface Tool {
  readonly name: string;
  readonly description: string;
  getDefinition(): ToolDefinition;
  execute(args: Record<string, any>, agent: Agent): Promise<ToolResult>;
}
```

### `ToolDefinition`

Format OpenAI function calling:

```typescript
interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  };
}
```

### `ToolResult`

Résultat standardisé:

```typescript
interface ToolResult {
  success?: boolean;
  error?: string;
  [key: string]: any; // Custom properties
}
```

## Méthodes Agent disponibles

Les tools ont accès à l'agent avec ces méthodes:

```typescript
// Filesystem
agent.getVFS()           // VirtualFileSystem
agent.getFileManager()   // FileManager

// Memory
agent.getMemory()        // AgentMemory

// Execution
agent.getExecutor()      // CodeExecutor

// Todo management
agent.getTodoManager()   // TodoManager

// Project
agent.getProjectName()   // string
agent.setProjectName(name: string)
agent.getWorkspacePath() // string
agent.saveCurrentProject()
agent.loadProjectFromDisk(name: string)
```

## Avantages de cette architecture

1. ✅ **Séparation des préoccupations**: Chaque tool dans sa propre classe
2. ✅ **Type safety**: TypeScript garantit la cohérence
3. ✅ **Testabilité**: Facile de tester chaque tool isolément
4. ✅ **Extensibilité**: Ajouter un tool = créer une classe
5. ✅ **Maintenabilité**: Code organisé et facile à naviguer
6. ✅ **Réutilisabilité**: Partager la logique via `BaseTool`
7. ✅ **Validation automatique**: `validateArgs()` intégré
8. ✅ **Documentation**: Le schema sert de doc

## Registry Pattern

Le `ToolRegistry` centralise:
- 🔧 Enregistrement des tools
- 📋 Génération des définitions pour l'API
- 🚀 Routing de l'exécution
- ❌ Gestion des erreurs

Usage:

```typescript
import { toolRegistry } from "./tools/index.js";

// Get all tool definitions for API
const definitions = toolRegistry.getToolDefinitions();

// Execute a tool
const result = await toolRegistry.execute("write_file", { filename: "test.js", content: "..." }, agent);

// Check if tool exists
if (toolRegistry.has("my_tool")) { ... }
```

## Best Practices

1. **Validation**: Toujours valider les arguments requis
2. **Error handling**: Retourner `{ success: false, error: "..." }` en cas d'erreur
3. **Typage**: Définir des interfaces pour les résultats custom
4. **Description**: Écrire des descriptions claires pour le LLM
5. **Tests**: Tester chaque tool indépendamment
6. **Performance**: Async/await pour les opérations I/O
7. **Logging**: Logger les erreurs importantes
8. **Sécurité**: Valider les inputs dangereux (paths, code, etc.)

## Migration depuis l'ancien système

L'ancien système utilisait:
- ❌ Un gros fichier `tools.ts` avec un array
- ❌ Un switch case géant dans l'agent
- ❌ Pas de séparation des responsabilités

Le nouveau système utilise:
- ✅ Des classes par catégorie de tools
- ✅ Un registry qui route automatiquement
- ✅ Une architecture propre et extensible

Pour migrer un ancien tool:
1. Créer une classe qui extend `BaseTool`
2. Copier la logique dans `execute()`
3. Définir le schema dans `getParametersSchema()`
4. Enregistrer dans le registry
5. Supprimer l'ancien code du switch case

---

**Note**: Cette architecture est inspirée des patterns modernes d'architecture logicielle (Strategy Pattern, Registry Pattern) et des meilleures pratiques TypeScript! 🚀
