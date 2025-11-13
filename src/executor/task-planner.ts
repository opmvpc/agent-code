// src/executor/task-planner.ts
/**
 * Task planner qui décompose les tâches complexes
 * Parce que faire tout d'un coup = recipe for disaster 🎯
 */

import chalk from 'chalk';

export interface Task {
  id: string;
  description: string;
  type: 'file_write' | 'file_read' | 'code_execute' | 'think';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  params?: Record<string, unknown>;
  result?: string;
  error?: string;
}

export interface TaskPlan {
  goal: string;
  tasks: Task[];
  currentTaskIndex: number;
}

export class TaskPlanner {
  /**
   * Crée un plan de tâches à partir d'une requête utilisateur
   */
  createPlan(userRequest: string, llmSuggestions?: string[]): TaskPlan {
    const tasks: Task[] = [];

    // Si le LLM a fourni des suggestions, les utiliser
    if (llmSuggestions && llmSuggestions.length > 0) {
      llmSuggestions.forEach((suggestion, index) => {
        tasks.push({
          id: `task_${index + 1}`,
          description: suggestion,
          type: this.inferTaskType(suggestion),
          status: 'pending',
        });
      });
    }

    return {
      goal: userRequest,
      tasks,
      currentTaskIndex: 0,
    };
  }

  /**
   * Infère le type de tâche depuis la description
   */
  private inferTaskType(description: string): Task['type'] {
    const lower = description.toLowerCase();

    if (lower.includes('write') || lower.includes('create') || lower.includes('save')) {
      return 'file_write';
    }
    if (lower.includes('read') || lower.includes('check') || lower.includes('view')) {
      return 'file_read';
    }
    if (lower.includes('execute') || lower.includes('run') || lower.includes('test')) {
      return 'code_execute';
    }

    return 'think';
  }

  /**
   * Marque une tâche comme en cours
   */
  startTask(plan: TaskPlan, taskId: string): void {
    const task = plan.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = 'in_progress';
    }
  }

  /**
   * Marque une tâche comme complétée
   */
  completeTask(plan: TaskPlan, taskId: string, result?: string): void {
    const task = plan.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = 'completed';
      task.result = result;
      plan.currentTaskIndex++;
    }
  }

  /**
   * Marque une tâche comme échouée
   */
  failTask(plan: TaskPlan, taskId: string, error: string): void {
    const task = plan.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = 'failed';
      task.error = error;
    }
  }

  /**
   * Récupère la tâche en cours
   */
  getCurrentTask(plan: TaskPlan): Task | undefined {
    return plan.tasks[plan.currentTaskIndex];
  }

  /**
   * Check si toutes les tâches sont complétées
   */
  isComplete(plan: TaskPlan): boolean {
    return plan.tasks.every(t => t.status === 'completed');
  }

  /**
   * Check si une tâche a échoué
   */
  hasFailed(plan: TaskPlan): boolean {
    return plan.tasks.some(t => t.status === 'failed');
  }

  /**
   * Pretty print du plan
   */
  displayPlan(plan: TaskPlan): string {
    const lines = [
      chalk.bold.cyan(`🎯 Goal: ${plan.goal}`),
      chalk.gray('─'.repeat(60)),
    ];

    plan.tasks.forEach((task, index) => {
      const icon = this.getStatusIcon(task.status);
      const color = this.getStatusColor(task.status);
      const description = color(task.description);

      lines.push(`${icon} ${index + 1}. ${description}`);

      if (task.error) {
        lines.push(chalk.red(`   ↳ Error: ${task.error}`));
      }
      if (task.result) {
        lines.push(chalk.gray(`   ↳ ${task.result.substring(0, 50)}...`));
      }
    });

    lines.push(chalk.gray('─'.repeat(60)));

    const completed = plan.tasks.filter(t => t.status === 'completed').length;
    const total = plan.tasks.length;
    lines.push(chalk.gray(`Progress: ${completed}/${total} tasks completed`));

    return lines.join('\n');
  }

  /**
   * Get status icon
   */
  private getStatusIcon(status: Task['status']): string {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'in_progress':
        return '🔄';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
    }
  }

  /**
   * Get status color function
   */
  private getStatusColor(status: Task['status']): (text: string) => string {
    switch (status) {
      case 'pending':
        return chalk.gray;
      case 'in_progress':
        return chalk.yellow;
      case 'completed':
        return chalk.green;
      case 'failed':
        return chalk.red;
    }
  }
}

