// src/core/memory.ts
/**
 * Memory management pour l'agent
 * Parce que sans mémoire, c'est juste un chatbot débile 🧠
 */

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp?: Date;
  // For tool results:
  toolCallId?: string;
}

export interface ConversationContext {
  messages: Message[];
  filesCreated: string[];
  lastExecutionResult?: string;
  taskHistory: string[];
}

export class AgentMemory {
  private context: ConversationContext;
  private readonly maxMessages: number;

  constructor(maxMessages: number = 10) {
    this.maxMessages = maxMessages;
    this.context = {
      messages: [],
      filesCreated: [],
      taskHistory: [],
    };
  }

  /**
   * Ajoute un message à l'historique
   * (avec trimming automatique parce que t'as pas une mémoire infinie gamin)
   */
  addMessage(role: Message['role'], content: string, metadata?: Partial<Message>): void {
    this.context.messages.push({
      role,
      content,
      timestamp: new Date(),
      ...metadata, // Allow additional fields (tool_name, tool_calls, etc.)
    });

    // Garde seulement les N derniers messages (sauf le system prompt)
    const systemMessages = this.context.messages.filter(m => m.role === 'system');
    const otherMessages = this.context.messages.filter(m => m.role !== 'system');

    if (otherMessages.length > this.maxMessages) {
      const keep = otherMessages.slice(-this.maxMessages);
      this.context.messages = [...systemMessages, ...keep];
    }
  }

  /**
   * Ajoute un résultat de tool à l'historique (avec métadonnées)
   */
  addToolResult(toolName: string, result: string, toolCallId: string): void {
    this.context.messages.push({
      role: "tool",
      content: result,
      toolCallId: toolCallId,
      timestamp: new Date(),
    });

    // Apply same trimming logic
    const systemMessages = this.context.messages.filter(m => m.role === 'system');
    const otherMessages = this.context.messages.filter(m => m.role !== 'system');

    if (otherMessages.length > this.maxMessages) {
      const keep = otherMessages.slice(-this.maxMessages);
      this.context.messages = [...systemMessages, ...keep];
    }
  }

  /**
   * Met à jour le message système (pour injection dynamique de la todolist)
   */
  updateSystemMessage(newSystemPrompt: string): void {
    const systemMessageIndex = this.context.messages.findIndex((m) => m.role === "system");
    if (systemMessageIndex !== -1) {
      this.context.messages[systemMessageIndex].content = newSystemPrompt;
    } else {
      // Si pas de system message, on l'ajoute au début
      this.context.messages.unshift({ role: "system", content: newSystemPrompt, timestamp: new Date() });
    }
  }

  /**
   * Récupère tous les messages pour le LLM (format compatible SDK OpenRouter)
   */
  getMessages(): Message[] {
    return this.context.messages.map(m => {
      const msg: any = {
        role: m.role,
        content: m.content,
      };
      // Add toolCallId for tool messages
      if (m.role === 'tool' && m.toolCallId) {
        msg.toolCallId = m.toolCallId;
      }
      return msg;
    });
  }

  /**
   * Enregistre qu'un fichier a été créé
   */
  addFileCreated(filename: string): void {
    if (!this.context.filesCreated.includes(filename)) {
      this.context.filesCreated.push(filename);
    }
  }

  /**
   * Enregistre le résultat de la dernière exécution
   */
  setLastExecutionResult(result: string): void {
    this.context.lastExecutionResult = result;
  }

  /**
   * Ajoute une tâche à l'historique
   */
  addTaskToHistory(task: string): void {
    this.context.taskHistory.push(task);
  }

  /**
   * Récupère le contexte complet
   */
  getContext(): ConversationContext {
    return { ...this.context };
  }

  /**
   * Reset complet de la mémoire
   * (pour quand t'as trop merdé et faut recommencer 🔄)
   */
  reset(): void {
    this.context = {
      messages: [],
      filesCreated: [],
      taskHistory: [],
    };
  }

  /**
   * Export de la mémoire en JSON
   */
  export(): string {
    return JSON.stringify(this.context, null, 2);
  }

  /**
   * Import de la mémoire depuis JSON
   */
  import(json: string): void {
    try {
      const imported = JSON.parse(json);
      this.context = {
        messages: imported.messages || [],
        filesCreated: imported.filesCreated || [],
        taskHistory: imported.taskHistory || [],
        lastExecutionResult: imported.lastExecutionResult,
      };
    } catch (error) {
      throw new Error(`Failed to import memory: ${error}`);
    }
  }
}
