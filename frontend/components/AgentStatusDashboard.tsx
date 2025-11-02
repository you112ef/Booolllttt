"use client";

import { useMemo } from "react";

export type AgentMode = "architect" | "coder" | "observer" | "debugger";

export type TaskEvent = {
  id: string;
  mode: AgentMode;
  status: "pending" | "running" | "completed" | "failed";
  message: string;
  timestamp: string;
};

export type TaskStatusSnapshot = {
  task_id: string;
  status: "queued" | "planning" | "coding" | "observing" | "debugging" | "completed" | "failed";
  summary?: string | null;
  plan?: string | null;
  code_patch?: string | null;
  fix_patch?: string | null;
  sandbox_logs?: string | null;
  history: TaskEvent[];
  created_at: string;
  updated_at: string;
};

type AgentStatusDashboardProps = {
  task?: TaskStatusSnapshot | null;
  onRefresh?: () => void;
  isPolling?: boolean;
};

const STATUS_LABELS: Record<TaskStatusSnapshot["status"], string> = {
  queued: "In wachtrij",
  planning: "Architect (Plan)",
  coding: "Coder (Act)",
  observing: "Sandbox (Observe)",
  debugging: "Debugger (Fix)",
  completed: "Afgerond",
  failed: "Mislukt"
};

const MODE_LABELS: Record<AgentMode, string> = {
  architect: "Architect",
  coder: "Coder",
  observer: "Sandbox",
  debugger: "Debugger"
};

export function AgentStatusDashboard({ task, onRefresh, isPolling = false }: AgentStatusDashboardProps) {
  const lastUpdated = task ? new Date(task.updated_at).toLocaleString() : null;

  const groupedHistory = useMemo(() => {
    if (!task) {
      return [];
    }
    return [...task.history].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [task]);

  return (
    <section className="w-full space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Agent status</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Volgt de Kilo-geinspireerde Plan -> Act -> Observe -> Fix cyclus over gespecialiseerde agenten.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={!onRefresh || isPolling}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Vernieuwen
        </button>
      </header>

      {!task ? (
        <div className="rounded-lg border border-dashed border-zinc-200 p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Dien een taak in om de voortgang van het agentische loop te volgen.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Huidige fase</span>
            <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              <span>{STATUS_LABELS[task.status]}</span>
              {lastUpdated && <span className="text-xs text-zinc-500 dark:text-zinc-400">Laatst bijgewerkt: {lastUpdated}</span>}
            </div>
          </div>

          {task.plan && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Architect plan</h3>
              <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-950/90 p-4 text-xs leading-relaxed text-zinc-100">
                {task.plan}
              </pre>
            </div>
          )}

          {task.code_patch && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Coder output</h3>
              <pre className="max-h-48 overflow-auto rounded-lg bg-emerald-950/40 p-4 text-xs leading-relaxed text-emerald-100">
                {task.code_patch}
              </pre>
            </div>
          )}

          {task.sandbox_logs && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Sandbox logs</h3>
              <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-200">
                {task.sandbox_logs}
              </pre>
            </div>
          )}

          {task.fix_patch && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Debugger patch</h3>
              <pre className="max-h-48 overflow-auto rounded-lg bg-amber-950/40 p-4 text-xs leading-relaxed text-amber-100">
                {task.fix_patch}
              </pre>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Historiek</h3>
            {groupedHistory.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Nog geen updates beschikbaar.</p>
            ) : (
              <ol className="space-y-3">
                {groupedHistory.map((event) => (
                  <li key={event.id} className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-800 dark:text-zinc-100">
                        {MODE_LABELS[event.mode]} - {event.status}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{event.message}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
