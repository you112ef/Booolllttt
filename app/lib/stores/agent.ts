import { create } from 'zustand';
import type { AgentTask } from '~/lib/modules/agent/types';

interface AgentStoreState {
  tasks: AgentTask[];
  activeTaskId?: string;
  isPanelOpen: boolean;
  isProcessing: boolean;
  error?: string;
  setProcessing: (processing: boolean) => void;
  setError: (error?: string) => void;
  togglePanel: (open?: boolean) => void;
  setActiveTask: (taskId?: string) => void;
  addTask: (task: AgentTask) => void;
  updateTask: (taskId: string, updater: (task: AgentTask) => AgentTask) => void;
  removeTask: (taskId: string) => void;
}

export const useAgentStore = create<AgentStoreState>((set) => ({
  tasks: [],
  isPanelOpen: false,
  isProcessing: false,
  setProcessing: (processing) =>
    set((state) => {
      if (processing) {
        return { ...state, isProcessing: true, error: undefined };
      }
      return { ...state, isProcessing: false };
    }),
  setError: (error) => set((state) => ({ ...state, error })),
  togglePanel: (open) =>
    set((state) => ({
      ...state,
      isPanelOpen: typeof open === 'boolean' ? open : !state.isPanelOpen,
    })),
  setActiveTask: (taskId) => set((state) => ({ ...state, activeTaskId: taskId })),
  addTask: (task) =>
    set((state) => ({
      ...state,
      tasks: [task, ...state.tasks],
      activeTaskId: task.id,
    })),
  updateTask: (taskId, updater) =>
    set((state) => ({
      ...state,
      tasks: state.tasks.map((task) => (task.id === taskId ? updater(task) : task)),
    })),
  removeTask: (taskId) =>
    set((state) => ({
      ...state,
      tasks: state.tasks.filter((task) => task.id !== taskId),
      activeTaskId: state.activeTaskId === taskId ? undefined : state.activeTaskId,
    })),
}));
