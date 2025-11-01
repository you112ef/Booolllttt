import React, { useMemo, useState } from 'react';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST } from '~/utils/constants';
import { useAgent } from '~/lib/hooks/useAgent';

interface AgentTaskPanelProps {
  compact?: boolean;
}

const STEP_STATUS_LABEL: Record<string, string> = {
  pending: 'Planned',
  'in-progress': 'In progress',
  completed: 'Complete',
  failed: 'Failed',
};

export function AgentTaskPanel({ compact = false }: AgentTaskPanelProps) {
  const { tasks, activeTaskId, isPanelOpen, isProcessing, error, startTask, togglePanel, setActiveTask } = useAgent();
  const [goal, setGoal] = useState('');
  const [notes, setNotes] = useState('');
  const [provider, setProvider] = useState('');
  const [maxSteps, setMaxSteps] = useState(5);

  const providers = useMemo(() => PROVIDER_LIST.map((provider) => provider.name), []);
  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) ?? tasks[0], [tasks, activeTaskId]);

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

  const renderCollapsed = () => (
    <button
      type="button"
      onClick={() => togglePanel(true)}
      className={classNames(
        'w-full flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3 rounded-lg border border-dashed',
        'border-bolt-elements-borderColor/60 bg-bolt-elements-background-depth-2 px-4 py-3 text-left hover:border-purple-400 transition-colors',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="i-ph:lightning-duotone w-5 h-5 text-purple-500" />
        <span className="text-sm font-medium text-bolt-elements-textPrimary">Launch Advanced Agent</span>
      </div>
      <span className="text-xs text-bolt-elements-textSecondary">
        Generate a contextual multi-step execution strategy for complex tasks.
      </span>
    </button>
  );

  const renderTaskSummary = () => {
    if (!activeTask) {
      return (
        <div className="rounded-lg border border-dashed border-bolt-elements-borderColor/60 bg-bolt-elements-background-depth-2 px-4 py-6 text-center">
          <p className="text-sm text-bolt-elements-textSecondary">No plans yet. Submit a goal to generate the first strategy.</p>
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
              {activeTask.provider || 'Default'}
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
                        Success Criteria
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

  if (!isPanelOpen) {
    return renderCollapsed();
  }

  return (
    <div
      className={classNames(
        'rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 md:p-5 shadow-sm transition-all duration-200',
        compact ? 'space-y-4' : 'space-y-6',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Advanced Agent</h3>
          <p className="text-xs text-bolt-elements-textSecondary">
            Build structured execution plans grounded in the current repository context with smart tool suggestions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => togglePanel(false)}
          className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textSecondary hover:border-purple-400 hover:text-purple-400 transition-colors"
        >
          <span>Hide</span>
          <div className="i-ph:caret-up w-3 h-3" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          <label className="flex items-center justify-between text-xs font-medium text-bolt-elements-textSecondary" htmlFor="agent-goal">
            Strategic goal
            <span className="text-[0.65rem] text-purple-400">Required</span>
          </label>
          <textarea
            id="agent-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Example: Refactor the service layer to expose an agent-driven entry point"
            className="min-h-[84px] w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="agent-notes">
            Context notes (optional)
          </label>
          <textarea
            id="agent-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Important files, deployment considerations, constraints?"
            className="min-h-[64px] w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="agent-provider">
              Model provider (optional)
            </label>
            <select
              id="agent-provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textPrimary focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
            >
              <option value="">Use defaults</option>
              {providers.map((providerName) => (
                <option key={providerName} value={providerName}>
                  {providerName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="agent-max-steps">
              Max steps
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
            The latest plans are retained for quick reference.
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
                <span>Planning?</span>
              </>
            ) : (
              <>
                <div className="i-ph:target w-3 h-3" />
                <span>Generate plan</span>
              </>
            )}
          </button>
        </div>
      </form>

      <div className="border-t border-bolt-elements-borderColor/60 pt-4 mt-2">
        <h4 className="text-xs font-semibold text-bolt-elements-textSecondary uppercase tracking-wide mb-3">
          Proposed execution steps
        </h4>
        {renderTaskSummary()}
      </div>
    </div>
  );
}
