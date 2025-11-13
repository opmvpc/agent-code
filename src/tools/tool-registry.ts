// src/tools/tool-registry.ts
/**
 * Registry pour gérer tous les tools de l'agent
 * Point central pour l'enregistrement et l'exécution
 */

import type { Tool, ToolDefinition, ToolResult } from "./base-tool.js";
import type { Agent } from "../core/agent.js";

// Import all tools
import { FileTool } from "./unified-file-tool.js";
import { ExecuteCodeTool } from "./execution-tools.js";
import { TodoTool } from "./todo-tools.js";
import { SendMessageTool, StopTool } from "./control-tools.js";
import { ProjectTool } from "./unified-project-tool.js";

/**
 * Registry pour gérer tous les tools disponibles
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    // Register all tools
    this.registerDefaultTools();
  }

  /**
   * Register tous les tools par défaut
   */
  private registerDefaultTools(): void {
    // File operations (unified CRUD tool)
    this.register(new FileTool());

    // Code execution
    this.register(new ExecuteCodeTool());

    // Todo management (unified tool)
    this.register(new TodoTool());

    // Project management (unified tool)
    this.register(new ProjectTool());

    // Control flow
    this.register(new SendMessageTool());
    this.register(new StopTool());
  }

  /**
   * Register un nouveau tool
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Get un tool par son nom
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get tous les tools
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get les définitions de tous les tools pour l'API
   */
  getToolDefinitions(): ToolDefinition[] {
    return this.getAllTools().map((tool) => tool.getDefinition());
  }

  /**
   * Execute un tool par son nom
   */
  async execute(
    name: string,
    args: Record<string, any>,
    agent: Agent
  ): Promise<ToolResult> {
    const tool = this.getTool(name);

    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${name}`,
      };
    }

    try {
      return await tool.execute(args, agent);
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        stack: (error as Error).stack,
      };
    }
  }

  /**
   * Check si un tool existe
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get le nombre de tools enregistrés
   */
  count(): number {
    return this.tools.size;
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();
