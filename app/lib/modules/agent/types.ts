import type { IProviderSetting } from '~/types/model';

export type AgentStepStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

export interface AgentStep {
  id: string;
  title: string;
  description?: string;
  successCriteria?: string;
  toolHints?: string[];
  status: AgentStepStatus;
  output?: string;
  error?: string;
}

export type AgentTaskStatus =
  | 'planning'
  | 'planned'
  | 'executing'
  | 'completed'
  | 'failed';

export interface AgentTask {
  id: string;
  goal: string;
  summary?: string;
  status: AgentTaskStatus;
  steps: AgentStep[];
  provider?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface AgentContext {
  files?: string[];
  notes?: string;
  environment?: Record<string, string>;
  browserInfo?: string;
}

export interface AgentRequest {
  goal: string;
  context?: AgentContext;
  provider?: string;
  maxSteps?: number;
  promptId?: string;
}

export interface AgentPlanStep {
  title: string;
  description?: string;
  successCriteria?: string;
  toolHints?: string[];
}

export interface AgentPlan {
  summary?: string;
  steps: AgentPlanStep[];
}

export interface AgentResponse {
  task: AgentTask;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AgentOrchestratorOptions {
  env?: Env;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
  defaultProviderName?: string;
  defaultModel?: string;
}
