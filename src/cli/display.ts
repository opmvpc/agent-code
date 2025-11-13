// src/cli/display.ts
/**
 * Display utilities pour faire des trucs beaux
 * Parce qu'un CLI moche = code moche 💅
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { highlight } from 'cli-highlight';

export class Display {
  /**
   * Banner ASCII art (obligatoire pour tout projet qui se respecte 🎨)
   */
  static showBanner(): void {
    const banner = `
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║     🤖 MINIMAL TS AGENT - Baby's First AI Agent 👶      ║
║                                                          ║
║     Un agent qui code (ou qui essaie en tout cas lol)   ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
    `;

    console.log(chalk.cyan(banner));
    console.log(chalk.gray('Type /help for commands | /exit to quit\n'));
  }

  /**
   * Affiche un message utilisateur
   */
  static userMessage(message: string): void {
    console.log(
      boxen(chalk.cyan(message), {
        padding: 1,
        margin: { top: 1, bottom: 0, left: 0, right: 0 },
        borderColor: 'cyan',
        title: '👤 You',
        titleAlignment: 'left',
      })
    );
  }

  /**
   * Affiche un message de l'agent
   */
  static agentMessage(message: string): void {
    console.log(
      boxen(chalk.green(message), {
        padding: 1,
        margin: { top: 1, bottom: 0, left: 0, right: 0 },
        borderColor: 'green',
        title: '🤖 Agent',
        titleAlignment: 'left',
      })
    );
  }

  /**
   * Affiche une pensée de l'agent (thought process)
   */
  static agentThought(thought: string): void {
    console.log(chalk.gray(`\n💭 ${thought}`));
  }

  /**
   * Affiche une action en cours
   */
  static action(message: string): void {
    console.log(chalk.yellow(`\n⚡ ${message}`));
  }

  /**
   * Affiche du code avec syntax highlighting
   */
  static code(code: string, language: string = 'javascript'): void {
    try {
      const highlighted = highlight(code, { language });
      console.log(
        boxen(highlighted, {
          padding: 1,
          borderColor: 'blue',
          title: `📝 ${language}`,
          titleAlignment: 'left',
        })
      );
    } catch {
      // Fallback si le highlighting fail
      console.log(
        boxen(code, {
          padding: 1,
          borderColor: 'blue',
          title: `📝 ${language}`,
          titleAlignment: 'left',
        })
      );
    }
  }

  /**
   * Affiche un résultat d'exécution
   */
  static executionResult(output: string, success: boolean, executionTime: number): void {
    const color = success ? 'green' : 'red';
    const icon = success ? '✅' : '❌';
    const title = success ? 'Success' : 'Error';

    console.log(
      boxen(output, {
        padding: 1,
        borderColor: color as 'green' | 'red',
        title: `${icon} ${title} (${executionTime}ms)`,
        titleAlignment: 'left',
      })
    );
  }

  /**
   * Affiche une erreur
   */
  static error(message: string): void {
    console.log(
      boxen(chalk.red(message), {
        padding: 1,
        borderColor: 'red',
        title: '❌ Error',
        titleAlignment: 'left',
      })
    );
  }

  /**
   * Affiche un warning
   */
  static warning(message: string): void {
    console.log(chalk.yellow(`\n⚠️  ${message}`));
  }

  /**
   * Affiche une info
   */
  static info(message: string): void {
    console.log(chalk.blue(`\nℹ️  ${message}`));
  }

  /**
   * Affiche un succès
   */
  static success(message: string): void {
    console.log(chalk.green(`\n✅ ${message}`));
  }

  /**
   * Divider
   */
  static divider(): void {
    console.log(chalk.gray('\n' + '─'.repeat(60) + '\n'));
  }

  /**
   * Clear screen (pour les maniacs de la propreté 🧹)
   */
  static clear(): void {
    console.clear();
    this.showBanner();
  }

  /**
   * Progress bar (parce que why not 📊)
   */
  static progress(current: number, total: number, label: string = ''): void {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * 20);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);

    const text = label
      ? `${label}: ${bar} ${percentage}% (${current}/${total})`
      : `${bar} ${percentage}% (${current}/${total})`;

    process.stdout.write(`\r${chalk.cyan(text)}`);

    if (current === total) {
      console.log(); // New line when complete
    }
  }

  /**
   * Table display (pour les stats et autres data 📋)
   */
  static table(data: Record<string, string | number>): void {
    const maxKeyLength = Math.max(...Object.keys(data).map(k => k.length));

    console.log();
    for (const [key, value] of Object.entries(data)) {
      const paddedKey = key.padEnd(maxKeyLength);
      console.log(chalk.gray(`  ${paddedKey} : `) + chalk.white(value));
    }
    console.log();
  }

  /**
   * Loading dots animation
   */
  static loadingDots(message: string, duration: number = 2000): Promise<void> {
    return new Promise(resolve => {
      const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let i = 0;

      const interval = setInterval(() => {
        process.stdout.write(`\r${frames[i]} ${chalk.cyan(message)}`);
        i = (i + 1) % frames.length;
      }, 80);

      setTimeout(() => {
        clearInterval(interval);
        process.stdout.write('\r' + ' '.repeat(message.length + 5) + '\r');
        resolve();
      }, duration);
    });
  }
}

