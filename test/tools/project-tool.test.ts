// test/tools/project-tool.test.ts
/**
 * Tests unitaires pour ProjectTool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProjectTool } from "../../src/tools/unified-project-tool.js";
import type { Agent } from "../../src/core/agent.js";

describe("ProjectTool", () => {
  let projectTool: ProjectTool;
  let mockAgent: any;

  beforeEach(() => {
    projectTool = new ProjectTool();

    mockAgent = {
      createProject: vi.fn(),
      switchProject: vi.fn(async () => {}),
      listProjects: vi.fn(() => ["project1", "project2", "my-app"]),
      getProjectName: vi.fn(() => "current-project"),
    };
  });

  describe("create action", () => {
    it("should create a new project", async () => {
      const result = await projectTool.execute(
        {
          action: "create",
          name: "new-project",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("create");
      expect(result.projectName).toBe("new-project");
      expect(mockAgent.createProject).toHaveBeenCalledWith("new-project");
    });

    it("should return error if name is missing", async () => {
      const result = await projectTool.execute(
        {
          action: "create",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("name parameter is required");
    });

    it("should handle creation errors", async () => {
      mockAgent.createProject.mockImplementation(() => {
        throw new Error("Project already exists");
      });

      const result = await projectTool.execute(
        {
          action: "create",
          name: "existing",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });
  });

  describe("switch action", () => {
    it("should switch to an existing project", async () => {
      const result = await projectTool.execute(
        {
          action: "switch",
          name: "project1",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("switch");
      expect(result.projectName).toBe("project1");
      expect(mockAgent.switchProject).toHaveBeenCalledWith("project1");
    });

    it("should return error if name is missing", async () => {
      const result = await projectTool.execute(
        {
          action: "switch",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("name parameter is required");
    });

    it("should handle switch errors", async () => {
      mockAgent.switchProject.mockRejectedValue(new Error("Project not found"));

      const result = await projectTool.execute(
        {
          action: "switch",
          name: "nonexistent",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Project not found");
    });
  });

  describe("list action", () => {
    it("should list all projects", async () => {
      const result = await projectTool.execute(
        {
          action: "list",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("list");
      expect(result.projects).toEqual(["project1", "project2", "my-app"]);
      expect(result.count).toBe(3);
      expect(mockAgent.listProjects).toHaveBeenCalled();
    });

    it("should handle empty project list", async () => {
      mockAgent.listProjects.mockReturnValue([]);

      const result = await projectTool.execute(
        {
          action: "list",
        },
        mockAgent
      );

      expect(result.success).toBe(true);
      expect(result.projects).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  describe("validation", () => {
    it("should return error if action is missing", async () => {
      const result = await projectTool.execute({}, mockAgent);

      expect(result.success).toBe(false);
      expect(result.error).toContain("action parameter is required");
    });

    it("should return error for unknown action", async () => {
      const result = await projectTool.execute(
        {
          action: "invalid",
        },
        mockAgent
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown action");
    });
  });

  describe("tool definition", () => {
    it("should have correct name and description", () => {
      expect(projectTool.name).toBe("project");
      expect(projectTool.description).toContain("Manage projects");
    });

    it("should have valid schema with create, switch, list actions", () => {
      const definition = projectTool.getDefinition();
      expect(definition.function.parameters.properties.action.enum).toContain("create");
      expect(definition.function.parameters.properties.action.enum).toContain("switch");
      expect(definition.function.parameters.properties.action.enum).toContain("list");
    });
  });
});
