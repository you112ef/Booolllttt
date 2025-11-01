import type { AgentEvent, AgentEventListener } from './types';

class AgentEventBus {
  private listeners: Map<string, Set<AgentEventListener>> = new Map();

  emit(event: AgentEvent) {
    const listeners = this.listeners.get(event.type) || new Set();
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('AgentEventBus listener error', error);
      }
    }
  }

  subscribe(type: AgentEvent['type'], listener: AgentEventListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    const bucket = this.listeners.get(type)!;
    bucket.add(listener);

    return () => {
      bucket.delete(listener);
      if (bucket.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  subscribeToAll(listener: AgentEventListener) {
    const unsubscribeFns: Array<() => void> = [];

    (['task-planned', 'task-updated', 'task-completed', 'task-failed', 'step-started', 'step-completed', 'step-failed'] as const).forEach(
      (type) => {
        unsubscribeFns.push(this.subscribe(type, listener));
      },
    );

    return () => {
      unsubscribeFns.forEach((fn) => fn());
    };
  }
}

const bus = new AgentEventBus();

export function emitAgentEvent(event: AgentEvent) {
  bus.emit(event);
}

export function onAgentEvent(type: AgentEvent['type'], listener: AgentEventListener) {
  return bus.subscribe(type, listener);
}

export function onAnyAgentEvent(listener: AgentEventListener) {
  return bus.subscribeToAll(listener);
}

