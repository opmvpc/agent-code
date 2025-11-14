// src/workspace/project-manager.ts
/**
 * Gestionnaire de projets et conversations
 * Source de vérité: .agent-storage/projects/
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "fs";
import { join, dirname } from "path";
import type {
  Project,
  ProjectMetadata,
  Conversation,
  ConversationData,
  ProjectData,
} from "./types.js";
import { BINARY_SNAPSHOT_PREFIX } from "../filesystem/virtual-fs.js";

export class ProjectManager {
  private basePath: string;

  constructor(basePath: string = ".agent-storage/projects") {
    this.basePath = basePath;
    this.ensureBasePath();
  }

  private ensureBasePath(): void {
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  // ========================================================================
  // PROJECT MANAGEMENT
  // ========================================================================

  /**
   * Liste tous les projets
   */
  listProjects(): Project[] {
    if (!existsSync(this.basePath)) {
      return [];
    }

    const dirs = readdirSync(this.basePath, { withFileTypes: true });
    const projects: Project[] = [];

    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const projectPath = join(this.basePath, dir.name);
        const metadataPath = join(projectPath, ".project.json");

        if (existsSync(metadataPath)) {
          const metadata: ProjectMetadata = JSON.parse(
            readFileSync(metadataPath, "utf8")
          );

          const conversationsPath = join(projectPath, "conversations");
          const conversationsCount = existsSync(conversationsPath)
            ? readdirSync(conversationsPath).length
            : 0;

          projects.push({
            name: metadata.name,
            path: projectPath,
            createdAt: new Date(metadata.createdAt),
            defaultModel: metadata.defaultModel,
            conversationsCount,
          });
        }
      }
    }

    return projects.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Crée un nouveau projet
   */
  createProject(name: string, defaultModel?: string): Project {
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const projectPath = join(this.basePath, sanitizedName);

    if (existsSync(projectPath)) {
      throw new Error(`Project "${sanitizedName}" already exists`);
    }

    // Créer structure
    mkdirSync(projectPath, { recursive: true });
    mkdirSync(join(projectPath, "conversations"), { recursive: true });

    // Créer métadonnées
    const metadata: ProjectMetadata = {
      name: sanitizedName,
      createdAt: new Date().toISOString(),
      defaultModel,
    };

    writeFileSync(
      join(projectPath, ".project.json"),
      JSON.stringify(metadata, null, 2)
    );

    return {
      name: sanitizedName,
      path: projectPath,
      createdAt: new Date(metadata.createdAt),
      defaultModel,
      conversationsCount: 0,
    };
  }

  /**
   * Récupère un projet par nom
   */
  getProject(name: string): Project | null {
    const projects = this.listProjects();
    return projects.find((p) => p.name === name) || null;
  }

  // ========================================================================
  // CONVERSATION MANAGEMENT
  // ========================================================================

  /**
   * Liste toutes les conversations d'un projet
   */
  listConversations(projectName: string): Conversation[] {
    const conversationsPath = join(
      this.basePath,
      projectName,
      "conversations"
    );

    if (!existsSync(conversationsPath)) {
      return [];
    }

    const files = readdirSync(conversationsPath).filter((f) =>
      f.endsWith(".json")
    );
    const conversations: Conversation[] = [];

    for (const file of files) {
      const convPath = join(conversationsPath, file);
      const data: ConversationData = JSON.parse(readFileSync(convPath, "utf8"));

      // Get VFS file count from project level
      const projectVfsPath = join(this.basePath, projectName, "vfs.json");
      let fileCount = 0;
      if (existsSync(projectVfsPath)) {
        try {
          const vfsData: ProjectData = JSON.parse(readFileSync(projectVfsPath, "utf8"));
          fileCount = Object.keys(vfsData.vfs).length;
        } catch {
          // Ignore errors
        }
      }

      conversations.push({
        id: data.metadata.id,
        name: data.metadata.name,
        createdAt: new Date(data.metadata.createdAt),
        lastModified: new Date(data.metadata.lastModified),
        messageCount: data.messages.length,
        fileCount: fileCount,
      });
    }

    return conversations.sort(
      (a, b) => b.lastModified.getTime() - a.lastModified.getTime()
    );
  }

  /**
   * Crée une nouvelle conversation
   */
  createConversation(projectName: string, name?: string): Conversation {
    const conversationsPath = join(
      this.basePath,
      projectName,
      "conversations"
    );

    if (!existsSync(conversationsPath)) {
      mkdirSync(conversationsPath, { recursive: true });
    }

    // Générer ID (conv-001, conv-002...)
    const existing = this.listConversations(projectName);
    const nextNum = existing.length + 1;
    const id = `conv-${String(nextNum).padStart(3, "0")}`;

    const now = new Date().toISOString();
    const conversationData: ConversationData = {
      metadata: {
        id,
        name: name || undefined, // Pas de nom par défaut - sera généré automatiquement
        createdAt: now,
        lastModified: now,
      },
      messages: [],
      todos: [],
      // vfs removed - now at project level!
    };

    const convPath = join(conversationsPath, `${id}.json`);
    writeFileSync(convPath, JSON.stringify(conversationData, null, 2));

    return {
      id,
      name: conversationData.metadata.name || `Conversation ${nextNum}`, // Nom par défaut pour l'affichage
      createdAt: new Date(now),
      lastModified: new Date(now),
      messageCount: 0,
      fileCount: 0,
    };
  }

  /**
   * Sauvegarde le VFS au niveau du projet (partagé entre conversations)
   */
  saveProjectVFS(
    projectName: string,
    vfsSnapshot: Record<string, string>
  ): void {
    const vfsPath = join(this.basePath, projectName, "vfs.json");

    try {
      const projectData: ProjectData = {
        vfs: vfsSnapshot,
        lastModified: new Date().toISOString(),
      };

      writeFileSync(vfsPath, JSON.stringify(projectData, null, 2));
    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Charge le VFS du projet (partagé entre conversations)
   */
  loadProjectVFS(projectName: string): Record<string, string> {
    const vfsPath = join(this.basePath, projectName, "vfs.json");

    if (!existsSync(vfsPath)) {
      return {}; // Empty VFS if doesn't exist
    }

    try {
      const projectData: ProjectData = JSON.parse(readFileSync(vfsPath, "utf8"));
      return projectData.vfs;
    } catch (error) {
      return {}; // Return empty on error
    }
  }

  /**
   * Met à jour le titre d'une conversation (généré automatiquement)
   */
  updateConversationTitle(
    projectName: string,
    convId: string,
    title: string
  ): void {
    const convPath = join(
      this.basePath,
      projectName,
      "conversations",
      `${convId}.json`
    );

    if (!existsSync(convPath)) {
      return;
    }

    try {
      const data: ConversationData = JSON.parse(readFileSync(convPath, "utf8"));
      data.metadata.name = title;
      data.metadata.lastModified = new Date().toISOString();
      writeFileSync(convPath, JSON.stringify(data, null, 2));
    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Charge une conversation
   */
  loadConversation(projectName: string, convId: string): ConversationData {
    const convPath = join(
      this.basePath,
      projectName,
      "conversations",
      `${convId}.json`
    );

    if (!existsSync(convPath)) {
      throw new Error(
        `Conversation "${convId}" not found in project "${projectName}"`
      );
    }

    return JSON.parse(readFileSync(convPath, "utf8"));
  }

  /**
   * Sauvegarde une conversation (sans VFS - géré au niveau projet)
   */
  saveConversation(
    projectName: string,
    convId: string,
    data: {
      messages: any[];
      todos: any[];
      name?: string;
    }
  ): void {
    const convPath = join(
      this.basePath,
      projectName,
      "conversations",
      `${convId}.json`
    );

    // Charge metadata existante ou crée nouvelle
    let metadata: ConversationData["metadata"];
    if (existsSync(convPath)) {
      const existing: ConversationData = JSON.parse(
        readFileSync(convPath, "utf8")
      );
      metadata = existing.metadata;
    } else {
      metadata = {
        id: convId,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      };
    }

    // Mise à jour
    metadata.lastModified = new Date().toISOString();
    if (data.name) {
      metadata.name = data.name;
    }

    const conversationData: ConversationData = {
      metadata,
      messages: data.messages,
      todos: data.todos,
      // vfs removed - saved at project level
    };

    writeFileSync(convPath, JSON.stringify(conversationData, null, 2));
  }

  // ========================================================================
  // WORKSPACE EXPORT (Read-only mirror)
  // ========================================================================

  /**
   * Exporte le VFS vers workspace/ (miroir read-only)
   */
  exportToWorkspace(
    projectName: string,
    vfsSnapshot: Record<string, string>
  ): void {
    const workspacePath = join(process.cwd(), "workspace", projectName);

    // Écrase le dossier existant
    if (existsSync(workspacePath)) {
      rmSync(workspacePath, { recursive: true, force: true });
    }

    // Crée le dossier
    mkdirSync(workspacePath, { recursive: true });

    // Écrit tous les fichiers
    for (const [filePath, content] of Object.entries(vfsSnapshot)) {
      const fullPath = join(workspacePath, filePath);
      const fileDir = dirname(fullPath);

      if (!existsSync(fileDir)) {
        mkdirSync(fileDir, { recursive: true });
      }

      if (content.startsWith(BINARY_SNAPSHOT_PREFIX)) {
        const base64 = content.slice(BINARY_SNAPSHOT_PREFIX.length);
        writeFileSync(fullPath, Buffer.from(base64, "base64"));
      } else {
        writeFileSync(fullPath, content, "utf8");
      }
    }
  }
}
