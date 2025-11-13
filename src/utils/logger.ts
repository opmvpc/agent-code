// src/utils/logger.ts
/**
 * Logger système avec Winston
 * Pour tracer TOUT ce qui se passe (enfin un vrai logger! 📝)
 */

import winston from "winston";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

// Créer le dossier logs si nécessaire
const logsDir = join(process.cwd(), "logs");
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Format custom pour des logs lisibles
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `[${timestamp}] ${level.toUpperCase().padEnd(7)} | ${message}`;

    // Ajouter les métadonnées si présentes
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }

    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: customFormat,
  transports: [
    // Log TOUT dans agent.log
    new winston.transports.File({
      filename: join(logsDir, "agent.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Log les erreurs dans un fichier séparé
    new winston.transports.File({
      filename: join(logsDir, "errors.log"),
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// En mode debug, ajouter aussi console output
if (process.env.DEBUG === "verbose") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      ),
    })
  );
}

/**
 * Helper pour logger les tool calls
 */
export function logToolCall(toolName: string, args: any, result?: any, error?: any): void {
  if (error) {
    logger.error(`Tool execution failed: ${toolName}`, {
      tool: toolName,
      arguments: args,
      error: error.message,
      stack: error.stack,
    });
  } else {
    logger.info(`Tool executed: ${toolName}`, {
      tool: toolName,
      arguments: args,
      result: typeof result === "string" ? result.slice(0, 200) : result,
    });
  }
}

/**
 * Helper pour logger les requêtes LLM
 */
export function logLLMRequest(model: string, messageCount: number, reasoning?: any): void {
  logger.info(`LLM request sent`, {
    model,
    messageCount,
    reasoning,
  });
}

/**
 * Helper pour logger les réponses LLM
 */
export function logLLMResponse(
  model: string,
  contentLength: number,
  toolCalls: number,
  usage: any
): void {
  logger.info(`LLM response received`, {
    model,
    contentLength,
    toolCalls,
    usage,
  });
}

/**
 * Helper pour logger le thinking/reasoning
 */
export function logThinking(content: string): void {
  logger.debug(`LLM thinking`, {
    thinking: content.slice(0, 500), // Max 500 chars
  });
}

/**
 * Helper pour logger les sessions
 */
export function logSession(action: string, sessionId?: string, details?: any): void {
  logger.info(`Session ${action}`, {
    sessionId,
    ...details,
  });
}

/**
 * Helper pour logger les erreurs générales
 */
export function logError(context: string, error: Error): void {
  logger.error(`Error in ${context}`, {
    message: error.message,
    stack: error.stack,
  });
}

export default logger;
