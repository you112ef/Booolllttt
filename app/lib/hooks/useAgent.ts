import { useCallback } from 'react';
import { toast } from 'react-toastify';
import type { AgentRequest, AgentResponse, AgentTask } from '~/lib/modules/agent/types';
import { useAgentStore } from '~/lib/stores/agent';

export function useAgent() {
  const tasks = useAgentStore((state) => state.tasks);
  const activeTaskId = useAgentStore((state) => state.activeTaskId);
  const isPanelOpen = useAgentStore((state) => state.isPanelOpen);
  const isProcessing = useAgentStore((state) => state.isProcessing);
  const error = useAgentStore((state) => state.error);
  const addTask = useAgentStore((state) => state.addTask);
  const setProcessing = useAgentStore((state) => state.setProcessing);
  const setError = useAgentStore((state) => state.setError);
  const togglePanel = useAgentStore((state) => state.togglePanel);
  const removeTask = useAgentStore((state) => state.removeTask);
  const setActiveTask = useAgentStore((state) => state.setActiveTask);
  const setTasks = useAgentStore((state) => state.setTasks);

  const refreshTasks = useCallback(async () => {
    try {
      const response = await fetch('/api/agent/run');

      if (!response.ok) {
        throw new Error(`Failed to fetch agent tasks (${response.status})`);
      }

      const data = (await response.json()) as { tasks?: AgentTask[] };

      if (Array.isArray(data.tasks)) {
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error('Failed to refresh agent tasks', error);
    }
  }, [setTasks]);

  const startTask = useCallback(
    async (payload: AgentRequest) => {
      const goal = payload.goal?.trim();

      if (!goal) {
        toast.error('Please provide a clear goal for the advanced agent');
        return false;
      }

      setProcessing(true);
      setError(undefined);

      try {
        const response = await fetch('/api/agent/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...payload, goal }),
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(errorBody.error || 'Agent planning failed');
        }

        const data = (await response.json()) as AgentResponse;
        addTask(data.task);
        togglePanel(true);
        setActiveTask(data.task.id);

        if (data.usage?.totalTokens) {
          toast.success(`Advanced agent plan ready (${data.usage.totalTokens} tokens)`);
        } else {
          toast.success('Advanced agent plan generated');
        }

        await refreshTasks();

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Advanced agent failed';
        setError(message);
        toast.error(message);
        return false;
      } finally {
        setProcessing(false);
      }
    },
    [addTask, refreshTasks, setActiveTask, setError, setProcessing, togglePanel],
  );

  const deleteTask = useCallback(
    (taskId: string) => {
      removeTask(taskId);
      if (activeTaskId === taskId) {
        setActiveTask(undefined);
      }
    },
    [activeTaskId, removeTask, setActiveTask],
  );

  return {
    tasks,
    activeTaskId,
    isPanelOpen,
    isProcessing,
    error,
    startTask,
    togglePanel,
    deleteTask,
    setActiveTask,
    refreshTasks,
  };
}
