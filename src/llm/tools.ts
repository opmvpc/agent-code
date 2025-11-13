// src/llm/tools.ts
/**
 * Tool definitions pour OpenRouter native tool calling
 * Enfin un vrai système standardisé! 🎉
 */

export interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

/**
 * Définition de tous nos tools pour l'agent
 */
export const AGENT_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or update a file in the virtual filesystem. Supports .js, .ts, .json, .txt, .md, .html, .css files.",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "The name/path of the file to write (e.g., 'app.js', 'src/utils.ts')",
          },
          content: {
            type: "string",
            description: "The full content to write to the file",
          },
        },
        required: ["filename", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file from the virtual filesystem",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "The name/path of the file to read",
          },
        },
        required: ["filename"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_code",
      description: "Execute JavaScript or TypeScript code in a secure sandbox. Only .js and .ts files can be executed. Timeout: 5 seconds. No external imports allowed.",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "The name/path of the JS or TS file to execute",
          },
        },
        required: ["filename"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List all files in the current project's virtual filesystem",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file from the virtual filesystem",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "The name/path of the file to delete",
          },
        },
        required: ["filename"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_project",
      description: "Create a new project and switch to it. Automatically saves the current project if it has files. Use descriptive names like 'calculator', 'todo-app', 'landing-page'.",
      parameters: {
        type: "object",
        properties: {
          project_name: {
            type: "string",
            description: "Descriptive name for the new project (e.g., 'weather-app', 'portfolio-site')",
          },
        },
        required: ["project_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "switch_project",
      description: "Load an existing project from workspace. Automatically saves the current project if it has files. If project doesn't exist, creates a new one.",
      parameters: {
        type: "object",
        properties: {
          project_name: {
            type: "string",
            description: "Name of the existing project to load",
          },
        },
        required: ["project_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_projects",
      description: "List all available projects in the workspace directory",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

/**
 * Tool result interface
 */
export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

