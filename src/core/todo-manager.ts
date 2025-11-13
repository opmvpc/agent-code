// src/core/todo-manager.ts
/**
 * Todo manager pour l'agent
 * Comme ça il peut organiser son propre travail! 📝
 */

import chalk from "chalk";

export interface Todo {
  task: string;
  completed: boolean;
  createdAt: Date;
}

export class TodoManager {
  private todos: Todo[] = [];

  /**
   * Ajoute une tâche
   */
  addTodo(task: string): void {
    this.todos.push({
      task,
      completed: false,
      createdAt: new Date(),
    });
  }

  /**
   * Ajoute plusieurs tâches d'un coup
   */
  addTodos(tasks: string[]): void {
    const now = new Date();
    for (const task of tasks) {
      this.todos.push({
        task,
        completed: false,
        createdAt: now,
      });
    }
  }

  /**
   * Marque une tâche comme complétée
   */
  completeTodo(task: string): boolean {
    const todo = this.todos.find((t) => t.task === task && !t.completed);
    if (todo) {
      todo.completed = true;
      return true;
    }
    return false;
  }

  /**
   * Liste toutes les tâches
   */
  listTodos(): Todo[] {
    return [...this.todos];
  }

  /**
   * Compte les tâches
   */
  getStats(): { total: number; completed: number; pending: number } {
    const total = this.todos.length;
    const completed = this.todos.filter((t) => t.completed).length;
    const pending = total - completed;
    return { total, completed, pending };
  }

  /**
   * Supprime une tâche spécifique
   */
  deleteTodo(task: string): boolean {
    const index = this.todos.findIndex((t) => t.task === task);
    if (index !== -1) {
      this.todos.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Efface toutes les tâches
   */
  clearTodos(): void {
    this.todos = [];
  }

  /**
   * Affiche la todolist dans le terminal
   */
  displayTodos(): string {
    if (this.todos.length === 0) {
      return chalk.gray("📝 No todos");
    }

    const stats = this.getStats();
    let output = chalk.cyan(`\n📝 Todo List (${stats.completed}/${stats.total} completed)\n\n`);

    this.todos.forEach((todo, index) => {
      const icon = todo.completed ? chalk.green("✓") : chalk.yellow("○");
      const style = todo.completed ? chalk.gray.strikethrough : chalk.white;
      output += `  ${icon} ${style(todo.task)}\n`;
    });

    return output;
  }
}
