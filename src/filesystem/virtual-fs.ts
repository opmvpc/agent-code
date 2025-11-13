// src/filesystem/virtual-fs.ts
/**
 * Virtual Filesystem avec memfs
 * Parce que toucher au vrai filesystem c'est dangereux pour un noob 🔥
 */

import { Volume, createFsFromVolume } from 'memfs';
import type { IFs } from 'memfs';
import path from 'path';

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  extension?: string;
}

export class VirtualFileSystem {
  private vol: Volume;
  private fs: IFs;
  private readonly workspacePath = '/workspace';
  private readonly maxTotalSize = 10 * 1024 * 1024; // 10MB max
  private readonly maxFileSize = 1 * 1024 * 1024; // 1MB per file

  constructor() {
    this.vol = new Volume();
    this.fs = createFsFromVolume(this.vol) as unknown as IFs;

    // Crée le workspace directory
    try {
      this.fs.mkdirSync(this.workspacePath, { recursive: true });
    } catch (error) {
      // Directory existe déjà, no problemo
    }
  }

  /**
   * Écrit un fichier (avec validation parce que trust nobody 🛡️)
   */
  writeFile(filename: string, content: string): void {
    const fullPath = this.getFullPath(filename);

    // Check file size
    const contentSize = Buffer.byteLength(content, 'utf8');
    if (contentSize > this.maxFileSize) {
      throw new Error(
        `File too large: ${contentSize} bytes (max ${this.maxFileSize} bytes). ` +
        `Skill issue detected! 🚫`
      );
    }

    // Check total size
    const currentSize = this.getTotalSize();
    if (currentSize + contentSize > this.maxTotalSize) {
      throw new Error(
        `Filesystem full: would exceed ${this.maxTotalSize} bytes. ` +
        `Delete some files first, gamin! 🗑️`
      );
    }

    // Crée les dossiers parents si nécessaire
    const dir = path.dirname(fullPath);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }

    this.fs.writeFileSync(fullPath, content, { encoding: 'utf8' } as any);
  }

  /**
   * Lit un fichier
   */
  readFile(filename: string): string {
    const fullPath = this.getFullPath(filename);

    if (!this.exists(filename)) {
      throw new Error(`File not found: ${filename}. T'as halluciné ce fichier? 👻`);
    }

    return this.fs.readFileSync(fullPath, 'utf8') as string;
  }

  /**
   * Check si une extension est supportée
   */
  isSupportedExtension(filename: string): boolean {
    const supportedExts = ['.js', '.ts', '.json', '.txt', '.md', '.html', '.css'];
    return supportedExts.some(ext => filename.toLowerCase().endsWith(ext));
  }

  /**
   * Supprime un fichier
   */
  deleteFile(filename: string): void {
    const fullPath = this.getFullPath(filename);

    if (!this.exists(filename)) {
      throw new Error(`Can't delete what doesn't exist: ${filename} 🤷`);
    }

    this.fs.unlinkSync(fullPath);
  }

  /**
   * Liste tous les fichiers
   */
  listFiles(directory: string = ''): FileInfo[] {
    const fullPath = directory
      ? this.getFullPath(directory)
      : this.workspacePath;

    if (!this.fs.existsSync(fullPath)) {
      return [];
    }

    const files: FileInfo[] = [];

    const readDir = (dirPath: string, relativePath: string = '') => {
      const entries = this.fs.readdirSync(dirPath) as string[];

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        const stats = this.fs.statSync(entryPath);
        const relPath = path.join(relativePath, entry);

        if (stats.isDirectory()) {
          files.push({
            name: entry,
            path: relPath,
            size: 0,
            isDirectory: true,
          });
          readDir(entryPath, relPath);
        } else {
          files.push({
            name: entry,
            path: relPath,
            size: stats.size,
            isDirectory: false,
            extension: path.extname(entry),
          });
        }
      }
    };

    readDir(fullPath);
    return files;
  }

  /**
   * Check si un fichier existe
   */
  exists(filename: string): boolean {
    const fullPath = this.getFullPath(filename);
    return this.fs.existsSync(fullPath);
  }

  /**
   * Reset complet du filesystem
   */
  reset(): void {
    this.vol = new Volume();
    this.fs = createFsFromVolume(this.vol) as unknown as IFs;
    this.fs.mkdirSync(this.workspacePath, { recursive: true });
  }

  /**
   * Calcule la taille totale utilisée
   */
  private getTotalSize(): number {
    const files = this.listFiles();
    return files.reduce((total, file) => total + file.size, 0);
  }

  /**
   * Génère le path complet
   */
  private getFullPath(filename: string): string {
    // Normalise le path et empêche les directory traversal attacks
    const normalized = path.normalize(filename).replace(/^(\.\.[\/\\])+/, '');
    return path.join(this.workspacePath, normalized);
  }

  /**
   * Export du filesystem en JSON
   */
  exportToJSON(): string {
    const files = this.listFiles();
    const data: Record<string, string> = {};

    for (const file of files) {
      if (!file.isDirectory) {
        data[file.path] = this.readFile(file.path);
      }
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Import du filesystem depuis JSON
   */
  importFromJSON(json: string): void {
    try {
      const data = JSON.parse(json);

      for (const [filename, content] of Object.entries(data)) {
        if (typeof content === 'string') {
          this.writeFile(filename, content);
        }
      }
    } catch (error) {
      throw new Error(`Failed to import filesystem: ${error}`);
    }
  }

  /**
   * Stats du filesystem (pour le flex 💪)
   */
  getStats(): { fileCount: number; totalSize: number; maxSize: number } {
    const files = this.listFiles().filter(f => !f.isDirectory);
    return {
      fileCount: files.length,
      totalSize: this.getTotalSize(),
      maxSize: this.maxTotalSize,
    };
  }
}
