"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AgentStatusDashboard, type TaskStatusSnapshot } from "@frontend/components/AgentStatusDashboard";
import { ApiKeyInputForm } from "@frontend/components/ApiKeyInputForm";
import { TaskSubmissionForm, type TaskSubmissionPayload } from "@frontend/components/TaskSubmissionForm";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function Home() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatusSnapshot | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const hasApiKey = useMemo(() => typeof apiKey === "string" && apiKey.length > 0, [apiKey]);

  const handleApiKeySubmit = (submittedKey: string) => {
    setApiKey(submittedKey);
    setInfo("API key opgeslagen voor deze sessie. Dien nu een taak in om de workflow te starten.");
    setError(null);
  };

  const handleTaskSubmission = async (payload: TaskSubmissionPayload) => {
    if (!hasApiKey || !apiKey) {
      setError("Voer eerst je OpenRouter API key in.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/submit_task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          api_key: apiKey,
          feature_description: payload.featureDescription,
          target_language: payload.targetLanguage
        })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Kon de taak niet starten.");
      }

      const data = (await response.json()) as { task_id: string };
      setTaskId(data.task_id);
      setTaskStatus(null);
      setInfo("Taak aangemaakt. De agent doorloopt nu de Plan -> Act -> Observe -> Fix cyclus.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Onbekende fout tijdens het starten van de taak.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshTaskStatus = useCallback(async () => {
    if (!taskId) {
      return;
    }

    try {
      setIsPolling(true);
      const response = await fetch(`${API_BASE_URL}/api/task_status/${taskId}`);
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Kon de taakstatus niet ophalen.");
      }

      const data = (await response.json()) as TaskStatusSnapshot;
      setTaskStatus(data);
      setError(null);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Onbekende fout tijdens het ophalen van de status.");
    } finally {
      setIsPolling(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    void refreshTaskStatus();
    const interval = window.setInterval(() => {
      void refreshTaskStatus();
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [taskId, refreshTaskStatus]);

  return (
    <div className="flex min-h-screen justify-center bg-gradient-to-br from-zinc-50 via-white to-zinc-100 px-4 py-10 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="flex w-full max-w-5xl flex-col gap-10">
        <header className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            OpenDevAgent - Kilo geinspireerde software engineer
          </h1>
          <p className="max-w-3xl text-base text-zinc-600 dark:text-zinc-300">
            Voer je OpenRouter API key in, beschrijf een taak en laat de multi-agent orchestrator (Architect -> Coder -> Sandbox -> Debugger) autonoom de Plan-Act-Observe-Fix loop doorlopen.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold">1. API key</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                De sleutel wordt veilig doorgestuurd naar de backend en alleen gebruikt voor deze workflow.
              </p>
              <div className="mt-4">
                <ApiKeyInputForm onSubmit={handleApiKeySubmit} disabled={isSubmitting} />
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold">2. Taakdetails</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Bepaal welke feature, stack en requirements je wilt laten bouwen.
              </p>
              <div className="mt-4">
                <TaskSubmissionForm onSubmit={handleTaskSubmission} disabled={!hasApiKey || isSubmitting} />
              </div>
            </div>

            {(error || info) && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  error
                    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-300"
                }`}
              >
                {error ?? info}
              </div>
            )}
          </div>

          <AgentStatusDashboard task={taskStatus} onRefresh={refreshTaskStatus} isPolling={isPolling} />
        </section>
      </main>
    </div>
  );
}
