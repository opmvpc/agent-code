// src/filesystem/file-manager.ts
/**
 * File manager avec pretty printing
 * Parce que même les fichiers virtuels méritent d'être beaux ✨
 */

import chalk from 'chalk';
import { VirtualFileSystem, type FileInfo } from './virtual-fs.js';

export class FileManager {
  private vfs: VirtualFileSystem;

  constructor(vfs: VirtualFileSystem) {
    this.vfs = vfs;
  }

  /**
   * Pretty print de l'arbre de fichiers
   */
  displayFileTree(): string {
    const files = this.vfs.listFiles();

    if (files.length === 0) {
      return chalk.gray('📁 /workspace (empty - t\'as la flemme de coder?)');
    }

    const lines: string[] = [chalk.bold.cyan('📁 /workspace')];
    const sortedFiles = this.sortFilesForDisplay(files);

    // Build tree structure
    const tree = this.buildTree(sortedFiles);
    this.renderTree(tree, '', lines);

    // Add stats
    const stats = this.vfs.getStats();
    const sizeInKB = (stats.totalSize / 1024).toFixed(2);
    const maxInMB = (stats.maxSize / 1024 / 1024).toFixed(0);
    lines.push('');
    lines.push(
      chalk.gray(
        `📊 ${stats.fileCount} file(s) | ${sizeInKB}KB / ${maxInMB}MB`
      )
    );

    return lines.join('\n');
  }

  /**
   * Affiche les détails d'un fichier
   */
  displayFileInfo(filename: string): string {
    if (!this.vfs.exists(filename)) {
      return chalk.red(`❌ File not found: ${filename}`);
    }

    const content = this.vfs.readFile(filename);
    const lines = content.split('\n').length;
    const size = Buffer.byteLength(content, 'utf8');

    const info = [
      chalk.bold.cyan(`📄 ${filename}`),
      chalk.gray(`   Size: ${size} bytes`),
      chalk.gray(`   Lines: ${lines}`),
      chalk.gray(`   Extension: ${this.getExtension(filename) || 'none'}`),
    ];

    return info.join('\n');
  }

  /**
   * Trie les fichiers pour l'affichage
   */
  private sortFilesForDisplay(files: FileInfo[]): FileInfo[] {
    return files.sort((a, b) => {
      // Directories first
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      // Then alphabetically
      return a.path.localeCompare(b.path);
    });
  }

  /**
   * Build tree structure
   */
  private buildTree(files: FileInfo[]): TreeNode {
    const root: TreeNode = { name: 'workspace', children: new Map(), isDirectory: true };

    for (const file of files) {
      const parts = file.path.split(/[/\\]/);
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;

        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            children: new Map(),
            isDirectory: !isLast,
            size: isLast ? file.size : 0,
            extension: isLast ? file.extension : undefined,
          });
        }

        current = current.children.get(part)!;
      }
    }

    return root;
  }

  /**
   * Render tree with fancy lines
   */
  private renderTree(node: TreeNode, prefix: string, lines: string[]): void {
    const entries = Array.from(node.children.entries());

    entries.forEach(([name, child], index) => {
      const isLast = index === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const icon = child.isDirectory ? '📁' : this.getFileIcon(child.extension);
      const displayName = child.isDirectory
        ? chalk.bold.blue(name)
        : chalk.white(name);

      const sizeInfo = !child.isDirectory && child.size
        ? chalk.gray(` (${(child.size / 1024).toFixed(2)}KB)`)
        : '';

      lines.push(`${prefix}${connector}${icon} ${displayName}${sizeInfo}`);

      if (child.children.size > 0) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        this.renderTree(child, newPrefix, lines);
      }
    });
  }

  /**
   * Get icon based on file extension
   */
  private getFileIcon(ext?: string): string {
    const icons: Record<string, string> = {
      '.js': '📜',
      '.ts': '📘',
      '.json': '📋',
      '.txt': '📄',
      '.md': '📝',
      '.html': '🌐',
      '.css': '🎨',
      '.htm': '🌐',
    };

    return icons[ext || ''] || '📄';
  }

  /**
   * Get file extension
   */
  private getExtension(filename: string): string | undefined {
    const match = filename.match(/\.[^.]+$/);
    return match ? match[0] : undefined;
  }
}

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  isDirectory: boolean;
  size?: number;
  extension?: string;
}
