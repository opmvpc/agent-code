// src/workspace/types.ts
/**
 * Types pour la gestion des projets et conversations
 */

export interface Project {
  name: string;
  path: string; // .agent-storage/projects/{name}/
  createdAt: Date;
  defaultModel?: string;
  conversationsCount: number;
}

export interface ProjectMetadata {
  name: string;
  createdAt: string;
  defaultModel?: string;
}

export interface Conversation {
  id: string; // conv-001, conv-002...
  name?: string; // Auto-généré ou custom
  createdAt: Date;
  lastModified: Date;
  messageCount: number;
  fileCount: number;
}

export interface ConversationData {
  metadata: {
    id: string;
    name?: string;
    createdAt: string;
    lastModified: string;
  };
  messages: any[]; // ChatCompletionMessageParam[]
  todos: Array<{
    task: string;
    completed: boolean;
    createdAt: Date;
  }>;
  // VFS removed - now at project level!
}

export interface ProjectData {
  vfs: Record<string, string>; // { "index.html": "content...", "style.css": "..." }
  lastModified: string;
}
