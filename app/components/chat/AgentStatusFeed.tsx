import React, { useMemo, useState } from 'react';
import { useAgent } from '~/lib/hooks/useAgent';
import type { AgentTask, AgentStep } from '~/lib/modules/agent/types';
import { classNames } from '~/utils/classNames';

const TASK_STATUS_LABEL: Record<AgentTask['status'], string> = {
  planning: 'Voorbereiding',
  planned: 'Gepland',
  executing: 'In uitvoering',
  completed: 'Afgerond',
  failed: 'Mislukt',
};

const TASK_STATUS_STYLE: Record<AgentTask['status'], string> = {
  planning: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
  planned: 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
  executing: 'bg-purple-500/10 text-purple-600 border border-purple-500/20',
  completed: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-600 border border-red-500/20',
};

const STEP_STATUS_STYLE: Record<AgentStep['status'], string> = {
  pending: 'bg-gray-100 text-gray-600',
  'in-progress': 'bg-blue-500/10 text-blue-600',
  completed: 'bg-emerald-500/10 text-emerald-600',
  failed: 'bg-red-500/10 text-red-600',
};

const STEP_STATUS_LABEL: Record<AgentStep['status'], string> = {
  pending: 'In wachtrij',
  'in-progress': 'Bezig',
  completed: 'Voltooid',
  failed: 'Mislukt',
};

const formatTimestamp = (iso?: string) => {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const AgentStatusFeed: React.FC = () => {
  const { tasks } = useAgent();
  const [open, setOpen] = useState(false);

  const { activeTasks, recentTasks } = useMemo(() => {
    const active = tasks.filter((task) => task.status !== 'completed' && task.status !== 'failed');
    const recent = tasks
      .filter((task) => task.status === 'completed' || task.status === 'failed')
      .slice(0, 3);

    return {
      activeTasks: active,
      recentTasks: recent,
    };
  }, [tasks]);

  const hasTasks = activeTasks.length > 0 || recentTasks.length > 0;

  if (!hasTasks) {
    return null;
  }

  const activeCount = activeTasks.length;

  return (
    <div className="fixed bottom-4 right-4 left-4 md:left-auto md:w-auto z-[70] pointer-events-none">
      <div
        className="max-w-sm md:max-w-xs ml-auto md:ml-0 md:mr-0 pointer-events-auto"
        aria-live="polite"
      >
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="w-full md:w-auto inline-flex items-center justify-between gap-2 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2 text-sm font-medium text-bolt-elements-textPrimary shadow-lg hover:border-purple-500 hover:text-purple-500 transition-colors"
        >
          <span className="inline-flex items-center gap-2">
            <span className="i-ph:robot-duotone w-4 h-4" />
            {activeCount > 0 ? `${activeCount} actieve ${activeCount === 1 ? 'taak' : 'taken'}` : 'Agentstatus'}
          </span>
          <span className={classNames('i-ph:caret-down w-4 h-4 transition-transform', open ? 'rotate-180' : '')} />
        </button>

        {open && (
          <div className="mt-3 rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/95 backdrop-blur-md shadow-2xl">
            <div className="px-4 py-3 border-b border-bolt-elements-borderColor/60">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Agentactiviteiten</h3>
              <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
                Volg de voortgang van alle lopende en recente taken.
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto modern-scrollbar">
              {activeTasks.length > 0 && (
                <div className="px-4 py-3 space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textTertiary">
                    Lopend
                  </h4>
                  {activeTasks.map((task) => (
                    <AgentStatusCard key={task.id} task={task} />
                  ))}
                </div>
              )}

              {recentTasks.length > 0 && (
                <div className="px-4 py-3 space-y-3 border-t border-bolt-elements-borderColor/60">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textTertiary">
                    Recent afgerond
                  </h4>
                  {recentTasks.map((task) => (
                    <AgentStatusCard key={task.id} task={task} compact />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface AgentStatusCardProps {
  task: AgentTask;
  compact?: boolean;
}

const AgentStatusCard: React.FC<AgentStatusCardProps> = ({ task, compact = false }) => {
  const taskStatusClass = TASK_STATUS_STYLE[task.status] ?? TASK_STATUS_STYLE.planned;
  const formattedUpdatedAt = formatTimestamp(task.updatedAt);
  const displayedSteps = compact ? task.steps.slice(0, 2) : task.steps;

  return (
    <div className="rounded-xl border border-bolt-elements-borderColor/60 bg-bolt-elements-background-depth-1 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-bolt-elements-textPrimary line-clamp-2">{task.goal}</p>
          <div className="mt-1 inline-flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
            <span className={classNames('px-2 py-0.5 rounded-full font-medium', taskStatusClass)}>{TASK_STATUS_LABEL[task.status]}</span>
            {formattedUpdatedAt && <span>? bijgewerkt om {formattedUpdatedAt}</span>}
          </div>
          {task.summary && !compact && (
            <p className="mt-1 text-xs text-bolt-elements-textSecondary/80 line-clamp-2">{task.summary}</p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {displayedSteps.map((step) => (
          <div
            key={step.id}
            className="flex items-start gap-2 rounded-lg bg-bolt-elements-background-depth-2/60 px-2 py-2"
          >
            <div className={classNames('mt-0.5 w-2 h-2 rounded-full', getStepAccent(step.status))} />
            <div className="flex-1">
              <p className="text-xs font-medium text-bolt-elements-textPrimary">{step.title}</p>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-bolt-elements-textSecondary mt-1">
                <span className={classNames('inline-flex items-center gap-1 px-2 py-0.5 rounded-full', STEP_STATUS_STYLE[step.status])}>
                  <span className="i-ph:activity w-3 h-3" />
                  {STEP_STATUS_LABEL[step.status]}
                </span>
                {step.toolHints && step.toolHints.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-bolt-elements-textSecondary/80">
                    <span className="i-ph:wrench w-3 h-3" />
                    {step.toolHints.join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {compact && task.steps.length > displayedSteps.length && (
          <p className="text-[11px] text-bolt-elements-textSecondary/80">{task.steps.length - displayedSteps.length} extra stappen verborgen</p>
        )}
      </div>

      {task.error && (
        <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-500">
          {task.error}
        </div>
      )}
    </div>
  );
};

function getStepAccent(status: AgentStep['status']) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500';
    case 'in-progress':
      return 'bg-blue-500 animate-pulse';
    case 'failed':
      return 'bg-red-500';
    default:
      return 'bg-gray-300 dark:bg-gray-600';
  }
}

