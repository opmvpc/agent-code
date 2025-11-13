// src/storage/storage-driver.ts
/**
 * Interface pour les drivers de storage
 * Inspiré d'unstorage mais en plus simple! 🎯
 */

export interface SessionData {
  projectName: string;
  files: Record<string, string>; // path -> content
  messages: Array<{ role: string; content: string | null; [key: string]: any }>;
  todos: Array<{ task: string; completed: boolean; createdAt: string }>;
  modelConfig?: {
    modelId: string;
    reasoningEnabled: boolean;
    reasoningEffort: "low" | "medium" | "high";
  };
  metadata: {
    lastSaved: string;
    version: string;
  };
}

export interface StorageDriver {
  /**
   * Nom du driver (pour debug)
   */
  name: string;

  /**
   * Sauvegarde une session
   */
  saveSession(sessionId: string, data: SessionData): Promise<void>;

  /**
   * Charge une session
   */
  loadSession(sessionId: string): Promise<SessionData | null>;

  /**
   * Liste toutes les sessions disponibles
   */
  listSessions(): Promise<string[]>;

  /**
   * Supprime une session
   */
  deleteSession(sessionId: string): Promise<void>;

  /**
   * Vérifie si une session existe
   */
  hasSession(sessionId: string): Promise<boolean>;

  /**
   * Nettoie le storage (optionnel)
   */
  clear?(): Promise<void>;
}
