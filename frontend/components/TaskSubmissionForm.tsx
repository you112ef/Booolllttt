"use client";

import { useState } from "react";

export type TaskSubmissionPayload = {
  featureDescription: string;
  targetLanguage: string;
};

type TaskSubmissionFormProps = {
  onSubmit: (payload: TaskSubmissionPayload) => Promise<void> | void;
  disabled?: boolean;
};

const LANGUAGE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "TypeScript (frontend)", value: "typescript" },
  { label: "Python (backend)", value: "python" },
  { label: "Go (backend)", value: "go" },
  { label: "Rust (systems)", value: "rust" }
];

export function TaskSubmissionForm({ onSubmit, disabled = false }: TaskSubmissionFormProps) {
  const [featureDescription, setFeatureDescription] = useState("");
  const [targetLanguage, setTargetLanguage] = useState(LANGUAGE_OPTIONS[0]?.value ?? "typescript");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = featureDescription.trim();

    if (!trimmed) {
      setError("Beschrijf de gewenste feature voordat je de taak start.");
      return;
    }

    setError(null);
    await onSubmit({ featureDescription: trimmed, targetLanguage });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="space-y-2">
        <label htmlFor="feature-description" className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          Taakbeschrijving
        </label>
        <textarea
          id="feature-description"
          name="feature-description"
          rows={4}
          className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm transition focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          placeholder="Bijvoorbeeld: Bouw een endpoint dat gebruikers kan registreren en hun profiel opslaat."
          value={featureDescription}
          onChange={(event) => setFeatureDescription(event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="target-language" className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          Doeltaal / framework
        </label>
        <select
          id="target-language"
          name="target-language"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm transition focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          value={targetLanguage}
          onChange={(event) => setTargetLanguage(event.target.value)}
          disabled={disabled}
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        Kilo-loop starten
      </button>
    </form>
  );
}
