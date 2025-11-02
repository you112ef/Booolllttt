"use client";

import { useState } from "react";

type ApiKeyInputFormProps = {
  onSubmit: (apiKey: string) => void;
  disabled?: boolean;
};

export function ApiKeyInputForm({ onSubmit, disabled = false }: ApiKeyInputFormProps) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedKey = apiKey.trim();

    if (!trimmedKey) {
      setError("Voer je OpenRouter API key in om verder te gaan.");
      return;
    }

    setError(null);
    onSubmit(trimmedKey);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3">
      <div className="flex flex-col gap-2">
        <label htmlFor="openrouter-api-key" className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          OpenRouter API key
        </label>
        <input
          id="openrouter-api-key"
          name="openrouter-api-key"
          type="password"
          autoComplete="off"
          placeholder="sk-or-v1-..."
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm transition focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          disabled={disabled}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400 disabled:text-zinc-200 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-100"
      >
        API key bevestigen
      </button>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        De sleutel wordt alleen doorgestuurd naar de backend voor deze sessie en nooit opgeslagen in de browser.
      </p>
    </form>
  );
}
