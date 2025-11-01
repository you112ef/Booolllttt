import { emitAgentEvent } from '~/lib/modules/agent/events';
import type { AgentEvent, AgentTask, AgentTaskStatus } from '~/lib/modules/agent/types';

class AgentTaskManager {
  private static instance: AgentTaskManager;
  private tasks: Map<string, AgentTask> = new Map();

  static getInstance() {
    if (!AgentTaskManager.instance) {
      AgentTaskManager.instance = new AgentTaskManager();
    }
    return AgentTaskManager.instance;
  }

  getTasks(): AgentTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  getTask(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId);
  }

  registerTask(task: AgentTask) {
    this.tasks.set(task.id, task);
    this.emit('task-planned', task);
  }

  updateTaskStatus(taskId: string, status: AgentTaskStatus, error?: string) {
    const task = this.tasks.get(taskId);

    if (!task) {
      return;
    }

    const updated: AgentTask = {
      ...task,
      status,
      error,
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(taskId, updated);

    const eventType: AgentEvent['type'] =
      status === 'completed' ? 'task-completed' : status === 'failed' ? 'task-failed' : 'task-updated';

    this.emit(eventType, updated, undefined, error ? { error } : undefined);
  }

  updateStep(taskId: string, stepId: string, update: Partial<AgentTask['steps'][number]>) {
    const task = this.tasks.get(taskId);

    if (!task) {
      return;
    }

    const steps = task.steps.map((step) => (step.id === stepId ? { ...step, ...update } : step));
    const updated: AgentTask = {
      ...task,
      steps,
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(taskId, updated);

    const status = update.status;
    let eventType: AgentEvent['type'] = 'step-started';

    if (status === 'completed') {
      eventType = 'step-completed';
    } else if (status === 'failed') {
      eventType = 'step-failed';
    }

    this.emit(eventType, updated, stepId, update.error ? { error: update.error } : undefined);
  }

  private emit(type: AgentEvent['type'], task: AgentTask, stepId?: string, meta?: Record<string, unknown>) {
    emitAgentEvent({
      type,
      timestamp: new Date().toISOString(),
      payload: {
        task,
        stepId,
        meta,
      },
    });
  }
}

export const agentTaskManager = AgentTaskManager.getInstance();

