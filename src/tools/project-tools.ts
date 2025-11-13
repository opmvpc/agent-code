// src/tools/project-tools.ts
/**
 * Tools pour la gestion des projets
 */

import { BaseTool, type ToolResult } from "./base-tool.js";
import type { Agent } from "../core/agent.js";

/**
 * Tool pour créer un nouveau projet
 */
export class CreateProjectTool extends BaseTool {
  readonly name = "create_project";
  readonly description = "Create and switch to a new project with a descriptive name";

  protected getParametersSchema() {
    return {
      properties: {
        project_name: {
          type: "string",
          description: "Descriptive project name (e.g., 'calculator', 'todo-app', 'landing-page')",
        },
      },
      required: ["project_name"],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    this.validateArgs(args, ["project_name"]);

    const { project_name } = args;

    try {
      // Save current project before switching
      await agent.saveCurrentProject();

      // Switch to new project
      agent.setProjectName(project_name);

      // Clear VFS for new project
      const files = agent.getVFS().listFiles().filter((f) => !f.isDirectory);
      for (const file of files) {
        agent.getVFS().deleteFile(file.path);
      }

      return {
        success: true,
        project: project_name,
        message: `Created and switched to project: ${project_name}`,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

/**
 * Tool pour charger un projet existant
 */
export class SwitchProjectTool extends BaseTool {
  readonly name = "switch_project";
  readonly description = "Switch to an existing project";

  protected getParametersSchema() {
    return {
      properties: {
        project_name: {
          type: "string",
          description: "Name of the project to load",
        },
      },
      required: ["project_name"],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    this.validateArgs(args, ["project_name"]);

    const { project_name } = args;

    try {
      // Save current project first
      await agent.saveCurrentProject();

      // Load project from disk
      await agent.loadProjectFromDisk(project_name);

      return {
        success: true,
        project: project_name,
        message: `Switched to project: ${project_name}`,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

/**
 * Tool pour lister les projets
 */
export class ListProjectsTool extends BaseTool {
  readonly name = "list_projects";
  readonly description = "List all available projects in the workspace";

  protected getParametersSchema() {
    return {
      properties: {},
      required: [],
    };
  }

  async execute(args: Record<string, any>, agent: Agent): Promise<ToolResult> {
    try {
      const workspacePath = agent.getWorkspacePath();
      const { existsSync, readdirSync } = await import("fs");

      if (!existsSync(workspacePath)) {
        return {
          success: true,
          projects: [],
          count: 0,
        };
      }

      const projects = readdirSync(workspacePath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      return {
        success: true,
        projects,
        count: projects.length,
        current: agent.getProjectName(),
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}
