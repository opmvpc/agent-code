// src/storage/storage-manager.ts
/**
 * Manager pour gérer les sessions de l'agent
 * Auto-save, auto-restore, tout ça! 💾
 */

import chalk from "chalk";
import type { StorageDriver, SessionData } from "./storage-driver.js";

export class StorageManager {
  private driver: StorageDriver;
  private currentSessionId: string;
  private autoSaveEnabled: boolean;
  private modelConfig?: {
    modelId: string;
    reasoningEnabled: boolean;
    reasoningEffort: "low" | "medium" | "high";
  };

  constructor(driver: StorageDriver, options: { autoSave?: boolean } = {}) {
    this.driver = driver;
    this.currentSessionId = this.generateSessionId();
    this.autoSaveEnabled = options.autoSave ?? true;
  }

  /**
   * Génère un ID de session unique
   */
  private generateSessionId(): string {
    const date = new Date();
    const timestamp = date.toISOString().replace(/[:.]/g, "-").slice(0, -5);
    return `session-${timestamp}`;
  }

  /**
   * Définit l'ID de session actuelle
   */
  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Récupère l'ID de session actuelle
   */
  getSessionId(): string {
    return this.currentSessionId;
  }

  /**
   * Sauvegarde la session actuelle
   */
  async saveSession(data: SessionData): Promise<void> {
    try {
      data.metadata = {
        lastSaved: new Date().toISOString(),
        version: "1.0.0",
      };

      await this.driver.saveSession(this.currentSessionId, data);

      if (process.env.DEBUG === "true") {
        console.log(
          chalk.gray(
            `💾 Session saved: ${this.currentSessionId} (${this.driver.name})`
          )
        );
      }
    } catch (error) {
      console.error(
        chalk.red(
          `Failed to save session: ${(error as Error).message}`
        )
      );
    }
  }

  /**
   * Charge une session
   */
  async loadSession(
    sessionId?: string
  ): Promise<SessionData | null> {
    try {
      const id = sessionId || this.currentSessionId;
      const data = await this.driver.loadSession(id);

      if (data) {
        this.currentSessionId = id;

        if (process.env.DEBUG === "true") {
          console.log(chalk.gray(`📂 Session loaded: ${id}`));
        }
      }

      return data;
    } catch (error) {
      console.error(
        chalk.red(
          `Failed to load session: ${(error as Error).message}`
        )
      );
      return null;
    }
  }

  /**
   * Liste toutes les sessions disponibles
   */
  async listSessions(): Promise<string[]> {
    return await this.driver.listSessions();
  }

  /**
   * Supprime une session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.driver.deleteSession(sessionId);
    console.log(chalk.gray(`🗑️  Session deleted: ${sessionId}`));
  }

  /**
   * Vérifie si une session existe
   */
  async hasSession(sessionId: string): Promise<boolean> {
    return await this.driver.hasSession(sessionId);
  }

  /**
   * Efface toutes les sessions
   */
  async clearAll(): Promise<void> {
    if (this.driver.clear) {
      await this.driver.clear();
      console.log(chalk.gray("🗑️  All sessions cleared"));
    }
  }

  /**
   * Active/désactive l'auto-save
   */
  setAutoSave(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
  }

  /**
   * Vérifie si l'auto-save est activé
   */
  isAutoSaveEnabled(): boolean {
    return this.autoSaveEnabled;
  }

  /**
   * Sauvegarde la config du modèle (en mémoire ET sur disque)
   */
  async setModelConfig(modelId: string, reasoningEnabled: boolean, reasoningEffort: "low" | "medium" | "high"): Promise<void> {
    this.modelConfig = { modelId, reasoningEnabled, reasoningEffort };

    // Sauvegarder immédiatement sur disque!
    try {
      await this.driver.saveSession("model-config", {
        projectName: "default",
        files: {},
        messages: [],
        todos: [],
        modelConfig: this.modelConfig,
        metadata: {
          lastSaved: new Date().toISOString(),
          version: "1.0.0"
        }
      });
    } catch (error) {
      console.error("Failed to save model config:", error);
    }
  }

  /**
   * Récupère la config du modèle sauvegardée
   */
  getModelConfig(): { modelId: string; reasoningEnabled: boolean; reasoningEffort: "low" | "medium" | "high" } | undefined {
    return this.modelConfig;
  }

  /**
   * Charge la config du modèle depuis le disque
   */
  async loadModelConfig(): Promise<void> {
    try {
      const stored = await this.driver.loadSession("model-config");
      if (stored && stored.modelConfig) {
        this.modelConfig = stored.modelConfig;
      }
    } catch (error) {
      // Pas de config sauvegardée = première fois
    }
  }
}
