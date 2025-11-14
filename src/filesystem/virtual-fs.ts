// src/filesystem/virtual-fs.ts
/**
 * Virtual Filesystem avec memfs
 * Parce que toucher au vrai filesystem c'est dangereux pour un noob
 */

import { Volume, createFsFromVolume } from 'memfs';
import type { IFs } from 'memfs';
import path from 'path';

export const BINARY_SNAPSHOT_PREFIX = '__BINARY__:';

const DEFAULT_BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.webp',
  '.ico',
  '.avif',
]);

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  extension?: string;
  isBinary?: boolean;
}

export class VirtualFileSystem {
  private vol: Volume;
  private fs: IFs;
  private readonly workspacePath = '/workspace';
  private readonly maxTotalSize = 40 * 1024 * 1024; // 40MB max
  private readonly maxFileSize = 8 * 1024 * 1024; // 8MB per file
  private readonly binaryExtensions: Set<string>;
  private binaryFiles: Set<string>;

  constructor() {
    this.vol = new Volume();
    this.fs = createFsFromVolume(this.vol) as unknown as IFs;
    this.binaryExtensions = new Set(DEFAULT_BINARY_EXTENSIONS);
    this.binaryFiles = new Set();

    // Crée le workspace directory
    try {
      this.fs.mkdirSync(this.workspacePath, { recursive: true });
    } catch (error) {
      // Directory existe déjà, no problemo
    }
  }

  /**
   * Écrit un fichier (avec validation parce que trust nobody)
   */
  writeFile(filename: string, content: string | Buffer): void {
    const normalizedPath = this.normalizePath(filename);
    const fullPath = this.getFullPath(normalizedPath);
    const isBuffer = Buffer.isBuffer(content);

    // Check file size
    const contentSize = isBuffer
      ? content.length
      : Buffer.byteLength(content, 'utf8');
    if (contentSize > this.maxFileSize) {
      throw new Error(
        `File too large: ${contentSize} bytes (max ${this.maxFileSize} bytes).`
      );
    }

    // Check total size
    const currentSize = this.getTotalSize();
    if (currentSize + contentSize > this.maxTotalSize) {
      throw new Error(
        `Filesystem full: would exceed ${this.maxTotalSize} bytes.`
      );
    }

    // Crée les dossiers parents si nécessaire
    const dir = path.dirname(fullPath);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }

    if (isBuffer) {
      this.fs.writeFileSync(fullPath, content);
      this.binaryFiles.add(normalizedPath);
    } else {
      this.fs.writeFileSync(fullPath, content, { encoding: 'utf8' } as any);
      this.binaryFiles.delete(normalizedPath);
    }
  }

  /**
   * Lit un fichier
   */
  readFile(filename: string, encoding: BufferEncoding = 'utf8'): string {
    const normalizedPath = this.normalizePath(filename);
    const fullPath = this.getFullPath(normalizedPath);

    if (!this.exists(filename)) {
      throw new Error(`File not found: ${filename}`);
    }

    if (this.binaryFiles.has(normalizedPath)) {
      const buffer = this.fs.readFileSync(fullPath) as Buffer;
      const mime = this.getMimeTypeFromExtension(path.extname(normalizedPath));
      return `data:${mime};base64,${buffer.toString('base64')}`;
    }

    return this.fs.readFileSync(fullPath, encoding) as string;
  }

  readFileBuffer(filename: string): Buffer {
    const normalizedPath = this.normalizePath(filename);
    const fullPath = this.getFullPath(normalizedPath);

    if (!this.exists(filename)) {
      throw new Error(`File not found: ${filename}`);
    }

    return this.fs.readFileSync(fullPath) as Buffer;
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
    const normalizedPath = this.normalizePath(filename);
    const fullPath = this.getFullPath(normalizedPath);

    if (!this.exists(filename)) {
      throw new Error(`Can't delete what doesn't exist: ${filename}`);
    }

    this.fs.unlinkSync(fullPath);
    this.binaryFiles.delete(normalizedPath);
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
        const relPath = relativePath ? `${relativePath}/${entry}` : entry;
        const normalizedRelPath = this.normalizePath(relPath);

        if (stats.isDirectory()) {
          files.push({
            name: entry,
            path: normalizedRelPath,
            size: 0,
            isDirectory: true,
          });
          readDir(entryPath, normalizedRelPath);
        } else {
          files.push({
            name: entry,
            path: normalizedRelPath,
            size: stats.size,
            isDirectory: false,
            extension: path.extname(entry),
            isBinary: this.binaryFiles.has(normalizedRelPath),
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
    this.binaryFiles = new Set();
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
    const normalized = this.normalizePath(filename);
    return path.join(this.workspacePath, normalized);
  }

  private normalizePath(filename: string): string {
    return path
      .normalize(filename)
      .replace(/^([\\/]+)/, '')
      .replace(/^(\.\.[\\/])+/, '')
      .replace(/\\/g, '/');
  }

  private getMimeTypeFromExtension(ext: string): string {
    switch (ext.toLowerCase()) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.gif':
        return 'image/gif';
      case '.bmp':
        return 'image/bmp';
      case '.webp':
        return 'image/webp';
      case '.ico':
        return 'image/x-icon';
      case '.avif':
        return 'image/avif';
      default:
        return 'image/png';
    }
  }

  /**
   * Export du filesystem en JSON
   */
  exportToJSON(): string {
    const files = this.listFiles();
    const data: Record<string, string> = {};

    for (const file of files) {
      if (!file.isDirectory) {
        data[file.path] = this.serializeFileContent(file.path);
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
          this.writeFileFromSerialized(filename, content);
        }
      }
    } catch (error) {
      throw new Error(`Failed to import filesystem: ${error}`);
    }
  }

  serializeFileContent(filename: string): string {
    if (this.isBinaryFile(filename)) {
      const buffer = this.readFileBuffer(filename);
      return `${BINARY_SNAPSHOT_PREFIX}${buffer.toString('base64')}`;
    }
    return this.readFile(filename);
  }

  writeFileFromSerialized(filename: string, serialized: string): void {
    if (serialized.startsWith(BINARY_SNAPSHOT_PREFIX)) {
      const base64 = serialized.slice(BINARY_SNAPSHOT_PREFIX.length);
      this.writeFile(filename, Buffer.from(base64, 'base64'));
    } else {
      this.writeFile(filename, serialized);
    }
  }

  isBinaryFile(filename: string): boolean {
    return this.binaryFiles.has(this.normalizePath(filename));
  }

  isBinaryExtension(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return this.binaryExtensions.has(ext);
  }

  /**
   * Stats du filesystem (pour le flex)
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