// src/tools/unified-project-tool.ts
/**
 * Tool unifié pour la gestion des projets
 */

import { BaseTool, type ToolResult } from "./base-tool.js";
import type { Agent } from "../core/agent.js";

export class ProjectTool extends BaseTool {
  readonly name = "project";
  readonly description = "Manage projects. Supports create, switch, and list actions.";

  protected getParametersSchema() {
    return {
      properties: {
        action: {
          type: "string",
          enum: ["create", "switch", "list"],
          description: "Action to perform: 'create' (create new project), 'switch' (load existing project), 'list' (show all projects)",
        },
        name: {
          type: "string",
          description: "Project name (required for 'create' and 'switch' actions)",
        },
      },
      required: ["action"],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    // Validate action parameter manually
    if (!args.action) {
      return {
        success: false,
        error: "action parameter is required",
      };
    }

    const { action, name } = args;

    switch (action) {
      case "create":
        return this.handleCreate(name, agent);

      case "switch":
        return this.handleSwitch(name, agent);

      case "list":
        return this.handleList(agent);

      default:
        return {
          success: false,
          error: `Unknown action: ${action}. Use 'create', 'switch', or 'list'.`,
        };
    }
  }

  /**
   * Handle creating a new project
   */
  private handleCreate(name: string, agent: Agent): ToolResult {
    if (!name) {
      return {
        success: false,
        error: "name parameter is required for 'create' action",
      };
    }

    try {
      agent.createProject(name);
      return {
        success: true,
        action: "create",
        projectName: name,
        message: `Project '${name}' created and activated`,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle switching to existing project
   */
  private handleSwitch(name: string, agent: Agent): ToolResult {
    if (!name) {
      return {
        success: false,
        error: "name parameter is required for 'switch' action",
      };
    }

    try {
      agent.switchProject(name);
      return {
        success: true,
        action: "switch",
        projectName: name,
        message: `Switched to project '${name}'`,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle listing all projects
   */
  private handleList(agent: Agent): ToolResult {
    try {
      const projects = agent.listProjects();
      return {
        success: true,
        action: "list",
        projects,
        count: projects.length,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}
