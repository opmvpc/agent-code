// src/tools/base-tool.ts
/**
 * Interface et classe de base pour tous les tools
 * Architecture propre pour les tools de l'agent 🛠️
 */

import type { Agent } from "../core/agent.js";

/**
 * Définition du schema d'un tool (format OpenAI function calling)
 */
export interface ToolDefinition {
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

/**
 * Résultat de l'exécution d'un tool
 */
export interface ToolResult {
  success?: boolean;
  error?: string;
  [key: string]: any; // Permet des propriétés custom
}

/**
 * Interface que tous les tools doivent implémenter
 */
export interface Tool {
  /** Nom du tool (doit matcher avec la définition) */
  readonly name: string;

  /** Description courte du tool */
  readonly description: string;

  /** Définition complète pour l'API (schema OpenAI) */
  getDefinition(): ToolDefinition;

  /**
   * Exécute le tool avec les arguments fournis
   * @param args Arguments parsés depuis la réponse LLM
   * @param agent Référence à l'agent (pour accéder VFS, memory, etc.)
   */
  execute(args: Record<string, any>, agent: Agent): Promise<ToolResult>;
}

/**
 * Classe de base abstraite pour les tools
 * Simplifie la création de nouveaux tools
 */
export abstract class BaseTool implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * Override pour définir le schema des paramètres
   */
  protected abstract getParametersSchema(): {
    properties: Record<string, any>;
    required?: string[];
  };

  /**
   * Override pour implémenter la logique du tool
   */
  abstract execute(args: Record<string, any>, agent: Agent): Promise<ToolResult>;

  /**
   * Génère la définition complète du tool
   */
  getDefinition(): ToolDefinition {
    const params = this.getParametersSchema();

    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: "object",
          properties: params.properties,
          required: params.required || [],
        },
      },
    };
  }

  /**
   * Valide les arguments requis
   */
  protected validateArgs(args: Record<string, any>, required: string[]): void {
    for (const field of required) {
      if (!(field in args)) {
        throw new Error(`Missing required argument: ${field}`);
      }
    }
  }
}
