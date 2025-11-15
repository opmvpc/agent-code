// src/utils/error-handler.ts
/**
 * Centralized Error Handler
 * Parce qu'avoir 60 try/catch sans cohérence c'est CRINGE 🤡
 *
 * Features:
 * - Log TOUTES les erreurs dans errors.log (stack trace complet)
 * - Format joli pour le CLI (concis mais informatif)
 * - Types d'erreurs custom pour catégoriser
 * - Context tracking pour savoir d'où vient l'erreur
 */

import logger from "./logger.js";
import chalk from "chalk";
import boxen from "boxen";

/**
 * Error types pour catégoriser les erreurs
 */
export enum ErrorType {
  API = "API_ERROR",
  TOOL = "TOOL_ERROR",
  VALIDATION = "VALIDATION_ERROR",
  FILESYSTEM = "FILESYSTEM_ERROR",
  EXECUTION = "EXECUTION_ERROR",
  PARSING = "PARSING_ERROR",
  NETWORK = "NETWORK_ERROR",
  UNKNOWN = "UNKNOWN_ERROR",
}

/**
 * Context pour tracer d'où vient l'erreur
 */
export interface ErrorContext {
  location?: string; // Ex: "chat.processRequest", "openrouter.chat"
  operation?: string; // Ex: "LLM request", "file write", "code execution"
  details?: Record<string, any>; // Metadata additionnelle
  userId?: string;
  projectName?: string;
  conversationId?: string;
}

/**
 * Custom error classes pour mieux typer
 */
export class AppError extends Error {
  constructor(
    message: string,
    public type: ErrorType,
    public context?: ErrorContext,
    public originalError?: Error
  ) {
    super(message);
    this.name = type;
    // Preserve stack trace
    if (originalError?.stack) {
      this.stack = originalError.stack;
    }
  }
}

export class ApiError extends AppError {
  constructor(message: string, context?: ErrorContext, originalError?: Error) {
    super(message, ErrorType.API, context, originalError);
  }
}

export class ToolError extends AppError {
  constructor(message: string, context?: ErrorContext, originalError?: Error) {
    super(message, ErrorType.TOOL, context, originalError);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: ErrorContext, originalError?: Error) {
    super(message, ErrorType.VALIDATION, context, originalError);
  }
}

export class FileSystemError extends AppError {
  constructor(message: string, context?: ErrorContext, originalError?: Error) {
    super(message, ErrorType.FILESYSTEM, context, originalError);
  }
}

export class ExecutionError extends AppError {
  constructor(message: string, context?: ErrorContext, originalError?: Error) {
    super(message, ErrorType.EXECUTION, context, originalError);
  }
}

export class ParsingError extends AppError {
  constructor(message: string, context?: ErrorContext, originalError?: Error) {
    super(message, ErrorType.PARSING, context, originalError);
  }
}

/**
 * Main Error Handler - Le boss qui gère tout 😎
 */
export class ErrorHandler {
  /**
   * Handle error - Log + optionally rethrow
   *
   * @param error - The error to handle
   * @param context - Where/why the error happened
   * @param options - { rethrow: true, display: true }
   */
  static handle(
    error: Error | AppError | unknown,
    context?: ErrorContext,
    options: { rethrow?: boolean; display?: boolean } = {}
  ): void {
    const { rethrow = false, display = false } = options;

    // Convert to proper Error object
    const err = this.normalizeError(error);

    // Enrich with context if it's an AppError
    if (err instanceof AppError && context) {
      err.context = { ...err.context, ...context };
    }

    // Log to errors.log (ALWAYS, with full details)
    this.logError(err, context);

    // Display in CLI if requested
    if (display) {
      this.displayError(err);
    }

    // Rethrow if requested
    if (rethrow) {
      throw err;
    }
  }

  /**
   * Async wrapper pour try/catch with auto-logging
   *
   * Usage:
   * const result = await ErrorHandler.handleAsync(
   *   llmClient.chat(messages),
   *   { location: "agent.processRequest", operation: "LLM request" }
   * );
   */
  static async handleAsync<T>(
    promise: Promise<T>,
    context?: ErrorContext
  ): Promise<T> {
    try {
      return await promise;
    } catch (error) {
      this.handle(error, context, { rethrow: true, display: false });
      throw error; // TypeScript needs this (unreachable)
    }
  }

  /**
   * Log error to errors.log avec TOUS les détails
   */
  static logError(error: Error, context?: ErrorContext): void {
    const errorData: any = {
      timestamp: new Date().toISOString(),
      type: error instanceof AppError ? error.type : ErrorType.UNKNOWN,
      message: error.message,
      name: error.name,
      stack: error.stack,
    };

    // Add context if provided
    if (context) {
      errorData.context = context;
    }

    // Add original error if it's an AppError
    if (error instanceof AppError && error.originalError) {
      errorData.originalError = {
        message: error.originalError.message,
        name: error.originalError.name,
        stack: error.originalError.stack,
      };
    }

    // Log to errors.log (Winston)
    logger.error("Error occurred", errorData);
  }

  /**
   * Format error for CLI display (joli mais concis)
   */
  static formatForCLI(error: Error | AppError): string {
    let message = error.message;

    // Add context if it's an AppError
    if (error instanceof AppError && error.context) {
      const ctx = error.context;
      const parts: string[] = [message];

      if (ctx.location) {
        parts.push(chalk.dim(`Location: ${ctx.location}`));
      }
      if (ctx.operation) {
        parts.push(chalk.dim(`Operation: ${ctx.operation}`));
      }

      message = parts.join("\n");
    }

    return message;
  }

  /**
   * Display error in CLI (boxed, pretty)
   */
  static displayError(error: Error | AppError): void {
    const formatted = this.formatForCLI(error);
    console.log(
      "\n" +
        boxen(formatted, {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "red",
          title: "❌ Error",
          titleAlignment: "center",
        })
    );
  }

  /**
   * Handle fatal errors (uncaught exceptions)
   */
  static fatal(error: Error | unknown): void {
    const err = this.normalizeError(error);

    this.logError(err, {
      location: "process.global",
      operation: "Fatal error (uncaught)",
    });

    console.error(chalk.red.bold("\n💀 FATAL ERROR - Application crashed!\n"));
    console.error(chalk.red(err.message));
    console.error(chalk.dim("\nCheck errors.log for full details."));
    console.error(chalk.dim(`Stack: ${err.stack?.split("\n")[1]?.trim() || "N/A"}\n`));

    process.exit(1);
  }

  /**
   * Normalize unknown error to Error object
   */
  private static normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    if (typeof error === "string") {
      return new Error(error);
    }

    if (error && typeof error === "object" && "message" in error) {
      return new Error(String((error as any).message));
    }

    return new Error("Unknown error occurred");
  }

  /**
   * Create error from API response (OpenRouter, etc.)
   */
  static fromApiResponse(
    response: any,
    context?: ErrorContext
  ): ApiError {
    let message = "API request failed";

    // Try to extract meaningful error message
    if (response?.error?.message) {
      message = response.error.message;
    } else if (response?.message) {
      message = response.message;
    } else if (typeof response === "string") {
      message = response;
    }

    return new ApiError(message, context, undefined);
  }

  /**
   * Infer error type from error message/properties
   */
  static inferErrorType(error: Error): ErrorType {
    const msg = error.message.toLowerCase();

    if (
      msg.includes("api") ||
      msg.includes("request failed") ||
      msg.includes("rate limit") ||
      msg.includes("401") ||
      msg.includes("authentication")
    ) {
      return ErrorType.API;
    }

    if (
      msg.includes("file") ||
      msg.includes("directory") ||
      msg.includes("path")
    ) {
      return ErrorType.FILESYSTEM;
    }

    if (
      msg.includes("validation") ||
      msg.includes("schema") ||
      msg.includes("zod")
    ) {
      return ErrorType.VALIDATION;
    }

    if (msg.includes("parse") || msg.includes("json") || msg.includes("syntax")) {
      return ErrorType.PARSING;
    }

    if (
      msg.includes("execution") ||
      msg.includes("runtime") ||
      msg.includes("timeout")
    ) {
      return ErrorType.EXECUTION;
    }

    if (msg.includes("network") || msg.includes("connection")) {
      return ErrorType.NETWORK;
    }

    return ErrorType.UNKNOWN;
  }
}

/**
 * Export types/classes pour utilisation ailleurs
 */
export {
  ErrorType as ErrorCategory,
  type ErrorContext as ErrorMetadata,
};
