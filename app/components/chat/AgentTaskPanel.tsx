import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST } from '~/utils/constants';
import { useAgent } from '~/lib/hooks/useAgent';

interface AgentTaskPanelProps {
  compact?: boolean;
}

type ToolCategory = 'analysis' | 'code' | 'devops' | 'data' | 'support';

interface AgentToolAvailability {
  id: string;
  title: string;
  description: string;
  category: ToolCategory;
  prerequisites?: string[];
  available: boolean;
  missingPrerequisites: string[];
  viaEnvironment?: boolean;
}

const STEP_STATUS_LABEL: Record<string, string> = {
  pending: 'Gepland',
  'in-progress': 'In uitvoering',
  completed: 'Voltooid',
  failed: 'Mislukt',
};

const CATEGORY_LABELS: Record<ToolCategory, string> = {
  analysis: 'Analyse',
  code: 'Code',
  devops: 'DevOps',
  data: 'Data',
  support: 'Ondersteuning',
};

const PREREQUISITE_LABELS: Record<string, string> = {
  git: 'Git beschikbaar',
  'supabase-project': 'Supabase project (URL & anon key)',
  'supabase-service-role': 'Supabase service-role key',
  'vercel-api-token': 'Vercel API-token',
  'netlify-api-token': 'Netlify API-token',
  'mcp-server-web': 'MCP-webserver geconfigureerd',
};

export function AgentTaskPanel({ compact = false }: AgentTaskPanelProps) {
  const { tasks, activeTaskId, isPanelOpen, isProcessing, error, startTask, togglePanel, setActiveTask } = useAgent();
  const [goal, setGoal] = useState('');
  const [notes, setNotes] = useState('');
  const [provider, setProvider] = useState('');
  const [maxSteps, setMaxSteps] = useState(5);
  const [toolCatalog, setToolCatalog] = useState<AgentToolAvailability[]>([]);
  const [isToolsLoading, setIsToolsLoading] = useState(true);
  const [toolError, setToolError] = useState<string | undefined>();

  const providers = useMemo(() => PROVIDER_LIST.map((providerItem) => providerItem.name), []);
  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) ?? tasks[0], [tasks, activeTaskId]);

  useEffect(() => {
    let cancelled = false;

    const loadTools = async () => {
      setIsToolsLoading(true);
      setToolError(undefined);

      try {
        const response = await fetch('/api/agent/tools');

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as { tools?: AgentToolAvailability[] };

        if (!cancelled && Array.isArray(data.tools)) {
          setToolCatalog(data.tools);
        }
      } catch (err) {
        console.error('Failed to load agent tools', err);
        if (!cancelled) {
          setToolCatalog([]);
          setToolError('Kan workflows niet laden. Controleer de serverconfiguratie.');
        }
      } finally {
        if (!cancelled) {
          setIsToolsLoading(false);
        }
      }
    };

    loadTools();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const succeeded = await startTask({
      goal,
      context: notes
        ? {
            notes,
          }
        : undefined,
      provider: provider || undefined,
      maxSteps,
    });

    if (succeeded) {
      setGoal('');
      setNotes('');
    }
  };

  const handleQuickStart = useCallback(
    async (tool: AgentToolAvailability) => {
      const succeeded = await startTask({
        goal: `Workflow: ${tool.title}`,
        context: {
          notes: tool.description,
          environment:
            tool.prerequisites && tool.prerequisites.length > 0
              ? { vereisten: tool.prerequisites.join(', ') }
              : undefined,
        },
        provider: provider || undefined,
        maxSteps,
      });

      if (succeeded) {
        setGoal('');
        setNotes('');
        togglePanel(true);
      }
    },
    [maxSteps, provider, startTask, togglePanel],
  );

  if (!isPanelOpen) {
    return null;
  }

  const renderTaskSummary = () => {
    if (!activeTask) {
      return (
        <div className="rounded-lg border border-dashed border-bolt-elements-borderColor/60 bg-bolt-elements-background-depth-2 px-4 py-6 text-center">
          <p className="text-sm text-bolt-elements-textSecondary">Nog geen plannen. Dien een doel in om de eerste strategie te genereren.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-3">
          <div className="flex justify-between items-start gap-3">
            <div>
              <h4 className="text-sm font-semibold text-bolt-elements-textPrimary">{activeTask.goal}</h4>
              {activeTask.summary && (
                <p className="text-xs text-bolt-elements-textSecondary mt-1">{activeTask.summary}</p>
              )}
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[0.65rem] font-medium text-purple-400">
              {activeTask.provider || 'Standaard'}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {activeTask.steps.map((step, index) => (
            <div
              key={step.id}
              className="rounded-lg border border-bolt-elements-borderColor/60 bg-bolt-elements-background-depth-1 px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/15 text-[0.75rem] font-semibold text-purple-400">
                  {index + 1}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-bolt-elements-textPrimary">{step.title}</p>
                    <span
                      className={classNames(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-medium',
                        step.status === 'completed'
                          ? 'bg-green-500/10 text-green-500'
                          : step.status === 'in-progress'
                            ? 'bg-blue-500/10 text-blue-400'
                            : step.status === 'failed'
                              ? 'bg-red-500/10 text-red-400'
                              : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary',
                      )}
                    >
                      {STEP_STATUS_LABEL[step.status] ?? step.status}
                    </span>
                  </div>
                  {step.description && (
                    <p className="text-xs text-bolt-elements-textSecondary leading-relaxed">{step.description}</p>
                  )}
                  {step.successCriteria && (
                    <div className="mt-2 rounded-md bg-bolt-elements-background-depth-3 px-3 py-2">
                      <p className="text-[0.65rem] font-semibold text-bolt-elements-textTertiary uppercase tracking-wide">
                        Succescriteria
                      </p>
                      <p className="text-xs text-bolt-elements-textSecondary whitespace-pre-wrap">
                        {step.successCriteria}
                      </p>
                    </div>
                  )}
                  {step.toolHints && step.toolHints.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {step.toolHints.map((hint) => (
                        <span
                          key={hint}
                          className="inline-flex items-center rounded-full bg-bolt-elements-background-depth-3 px-2 py-0.5 text-[0.65rem] text-bolt-elements-textTertiary"
                        >
                          {hint}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setActiveTask(task.id)}
              className={classNames(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                task.id === activeTask?.id
                  ? 'border-purple-400 bg-purple-500/10 text-purple-400'
                  : 'border-bolt-elements-borderColor hover:border-purple-400 text-bolt-elements-textSecondary',
              )}
            >
              {task.goal.slice(0, 32)}{task.goal.length > 32 ? '...' : ''}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className={classNames(
        'rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 md:p-5 shadow-sm transition-all duration-200',
        compact ? 'space-y-4' : 'space-y-6',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Geavanceerde agent</h3>
          <p className="text-xs text-bolt-elements-textSecondary">
            Maak plannen met contextuele workflow-suggesties en serverbeheerde connectors.
          </p>
        </div>
        <button
          type="button"
          onClick={() => togglePanel(false)}
          className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textSecondary hover:border-purple-400 hover:text-purple-400 transition-colors"
        >
          <span>Sluiten</span>
          <div className="i-ph:caret-up w-3 h-3" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          <label className="flex items-center justify-between text-xs font-medium text-bolt-elements-textSecondary" htmlFor="agent-goal">
            Strategisch doel
            <span className="text-[0.65rem] text-purple-400">Verplicht</span>
          </label>
          <textarea
            id="agent-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Bijvoorbeeld: Herstructureer de servicelaag voor agentgestuurde toegang"
            className="min-h-[84px] w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="agent-notes">
            Contextnotities (optioneel)
          </label>
          <textarea
            id="agent-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Belangrijke bestanden, deploy-overwegingen of beperkingen"
            className="min-h-[64px] w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="agent-provider">
              Modelprovider (optioneel)
            </label>
            <select
              id="agent-provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textPrimary focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
            >
              <option value="">Gebruik standaardinstellingen</option>
              {providers.map((providerName) => (
                <option key={providerName} value={providerName}>
                  {providerName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="agent-max-steps">
              Maximaal aantal stappen
            </label>
            <input
              id="agent-max-steps"
              type="number"
              min={3}
              max={12}
              value={maxSteps}
              onChange={(event) => setMaxSteps(Number(event.target.value) || 5)}
              className="w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textPrimary focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.65rem] uppercase tracking-wide text-bolt-elements-textTertiary">
            Laatste plannen blijven beschikbaar voor referentie.
          </span>
          <button
            type="submit"
            disabled={isProcessing}
            className={classNames(
              'inline-flex items-center gap-2 rounded-md bg-purple-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-purple-400 disabled:cursor-not-allowed disabled:bg-purple-500/50',
            )}
          >
            {isProcessing ? (
              <>
                <div className="i-ph:spinner-gap w-3 h-3 animate-spin" />
                <span>Plannen...</span>
              </>
            ) : (
              <>
                <div className="i-ph:target w-3 h-3" />
                <span>Plan genereren</span>
              </>
            )}
          </button>
        </div>
      </form>

      <div className="border-t border-bolt-elements-borderColor/60 pt-4 mt-2 space-y-4">
        <div>
          <h4 className="text-xs font-semibold text-bolt-elements-textSecondary uppercase tracking-wide mb-3">
            Beschikbare workflows
          </h4>
          {isToolsLoading ? (
            <p className="text-xs text-bolt-elements-textSecondary">Workflows worden geladen...</p>
          ) : toolError ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{toolError}</div>
          ) : toolCatalog.length === 0 ? (
            <p className="text-xs text-bolt-elements-textSecondary">Geen workflows gevonden.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {toolCatalog.map((tool) => (
                <div key={tool.id} className="rounded-xl border border-bolt-elements-borderColor/70 bg-bolt-elements-background-depth-1 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h5 className="text-sm font-semibold text-bolt-elements-textPrimary">{tool.title}</h5>
                      <p className="mt-1 text-xs text-bolt-elements-textSecondary leading-relaxed">{tool.description}</p>
                    </div>
                    <span
                      className={classNames(
                        'px-2 py-0.5 text-[11px] rounded-full font-medium',
                        tool.available
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
                      )}
                    >
                      {tool.available ? 'Beschikbaar' : 'Actie vereist'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-bolt-elements-background-depth-2 px-2 py-0.5 text-bolt-elements-textSecondary">
                      <span className="i-ph:folder-notch w-3 h-3" />
                      {CATEGORY_LABELS[tool.category]}
                    </span>
                    {tool.viaEnvironment && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5">
                        <span className="i-ph:keyhole w-3 h-3" />
                        Serversecret
                      </span>
                    )}
                  </div>

                  {tool.missingPrerequisites.length > 0 && (
                    <div className="mt-1 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-700 space-y-1">
                      <p className="font-medium">Ontbrekende vereisten</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {tool.missingPrerequisites.map((item) => (
                          <li key={item}>{PREREQUISITE_LABELS[item] ?? item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleQuickStart(tool)}
                    disabled={!tool.available || isProcessing}
                    className={classNames(
                      'w-full inline-flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                      tool.available
                        ? 'border-purple-500 text-purple-500 hover:bg-purple-500/10'
                        : 'border-bolt-elements-borderColor text-bolt-elements-textSecondary cursor-not-allowed opacity-70',
                    )}
                  >
                    {tool.available ? 'Workflow starten' : 'Configuratie vereist'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-bolt-elements-borderColor/60 pt-4">
          <h4 className="text-xs font-semibold text-bolt-elements-textSecondary uppercase tracking-wide mb-3">
            Voorgestelde uitvoeringstappen
          </h4>
          {renderTaskSummary()}
        </div>
      </div>
    </div>
  );
}
