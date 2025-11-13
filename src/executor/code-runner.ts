// src/executor/code-runner.ts
/**
 * Code execution sandbox avec vm2
 * Parce que laisser l'agent run n'importe quoi = suicide 💀
 */

import { NodeVM } from "vm2";
import { transform } from "esbuild";
import chalk from "chalk";

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTime: number;
}

export class CodeExecutor {
  private readonly timeout: number;

  constructor(
    timeout: number = 5000 // 5 seconds
  ) {
    this.timeout = timeout;
  }

  /**
   * Execute JavaScript code dans un sandbox
   */
  async executeJS(code: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    let capturedOutput = "";

    try {
      // Setup VM with restricted context
      const vm = new NodeVM({
        timeout: this.timeout,
        sandbox: {},
        console: "redirect",
        require: {
          external: false, // No external modules (t'es en prison gamin! 🔒)
          builtin: [], // No built-in modules
        },
        eval: false,
        wasm: false,
      });

      // Capture console output
      vm.on("console.log", (...args: unknown[]) => {
        capturedOutput += args.map((a) => String(a)).join(" ") + "\n";
      });

      vm.on("console.error", (...args: unknown[]) => {
        capturedOutput +=
          chalk.red(args.map((a) => String(a)).join(" ")) + "\n";
      });

      vm.on("console.warn", (...args: unknown[]) => {
        capturedOutput +=
          chalk.yellow(args.map((a) => String(a)).join(" ")) + "\n";
      });

      // Run code
      const result = vm.run(code);

      // If code returns something, add it to output
      if (result !== undefined) {
        capturedOutput += `\n${chalk.gray("→")} ${this.formatResult(result)}\n`;
      }

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        output:
          capturedOutput ||
          chalk.gray("(no output - code muet comme une carpe 🐟)"),
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        error: this.formatError(error),
        output: capturedOutput || undefined,
        executionTime,
      };
    }
  }

  /**
   * Execute TypeScript code (compile d'abord avec esbuild)
   */
  async executeTS(code: string): Promise<ExecutionResult> {
    try {
      // Compile TS to JS
      const result = await transform(code, {
        loader: "ts",
        format: "cjs",
        target: "es2020",
      });

      // Execute compiled JS
      return await this.executeJS(result.code);
    } catch (error) {
      return {
        success: false,
        error: `TypeScript compilation failed: ${this.formatError(error)}`,
        executionTime: 0,
      };
    }
  }

  /**
   * Execute code basé sur l'extension du fichier
   */
  async execute(code: string, fileExtension: string): Promise<ExecutionResult> {
    switch (fileExtension.toLowerCase()) {
      case ".ts":
        return await this.executeTS(code);
      case ".js":
        return await this.executeJS(code);
      default:
        return {
          success: false,
          error: `Unsupported file type: ${fileExtension}. Je sais faire que .js et .ts! 🤷`,
          executionTime: 0,
        };
    }
  }

  /**
   * Format le résultat pour l'affichage
   */
  private formatResult(result: unknown): string {
    if (typeof result === "object" && result !== null) {
      try {
        return JSON.stringify(result, null, 2);
      } catch {
        return String(result);
      }
    }
    return String(result);
  }

  /**
   * Format les erreurs (avec style 💅)
   */
  private formatError(error: unknown): string {
    if (error instanceof Error) {
      const lines = [chalk.red.bold(`❌ ${error.name}: ${error.message}`)];

      if (error.stack) {
        const stackLines = error.stack
          .split("\n")
          .slice(1, 4) // Prends seulement les 3 premières lignes de stack
          .map((line) => chalk.gray("  " + line.trim()));
        lines.push(...stackLines);
      }

      // Check for common errors
      if (error.message.includes("timeout")) {
        lines.push(
          chalk.yellow("\n💡 Ton code prend trop de temps! Infinite loop? 🔄")
        );
      }

      return lines.join("\n");
    }

    return chalk.red(`Unknown error: ${String(error)}`);
  }

  /**
   * Validate code avant exécution (basic security checks)
   */
  validateCode(code: string): { valid: boolean; reason?: string } {
    // Check for obvious dangerous patterns
    const dangerousPatterns = [
      /require\s*\(/i,
      /import\s+/i,
      /eval\s*\(/i,
      /Function\s*\(/i,
      /process\./i,
      /child_process/i,
      /fs\./i,
      /__dirname/i,
      /__filename/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return {
          valid: false,
          reason: `Detected forbidden pattern: ${pattern}. Nice try, hacker wannabe! 🚫`,
        };
      }
    }

    return { valid: true };
  }
}
