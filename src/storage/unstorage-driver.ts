// src/storage/unstorage-driver.ts
/**
 * Driver basé sur unstorage
 * Support fs, memory, cloudflare, etc. 🚀
 */

import { createStorage, type Storage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";
import type { StorageDriver, SessionData } from "./storage-driver.js";

export interface UnstorageDriverOptions {
  driver: "fs" | "memory";
  base?: string; // Pour fs: le dossier de base
}

export class UnstorageDriver implements StorageDriver {
  name = "unstorage";
  private storage: Storage;

  constructor(options: UnstorageDriverOptions = { driver: "memory" }) {
    if (options.driver === "fs") {
      this.storage = createStorage({
        driver: fsDriver({
          base: options.base || "./.agent-storage",
        }),
      });
    } else {
      // Memory driver (default)
      this.storage = createStorage();
    }
  }

  async saveSession(sessionId: string, data: SessionData): Promise<void> {
    const key = `sessions:${sessionId}`;
    await this.storage.setItem(key, data);
  }

  async loadSession(sessionId: string): Promise<SessionData | null> {
    const key = `sessions:${sessionId}`;
    const data = await this.storage.getItem<SessionData>(key);
    return data || null;
  }

  async listSessions(): Promise<string[]> {
    const keys = await this.storage.getKeys("sessions:");
    // Remove "sessions:" prefix
    return keys.map((key) => key.replace("sessions:", ""));
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = `sessions:${sessionId}`;
    await this.storage.removeItem(key);
  }

  async hasSession(sessionId: string): Promise<boolean> {
    const key = `sessions:${sessionId}`;
    return await this.storage.hasItem(key);
  }

  async clear(): Promise<void> {
    await this.storage.clear("sessions:");
  }
}
