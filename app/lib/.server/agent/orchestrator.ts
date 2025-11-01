import { generateId, generateText, type CoreTool, type GenerateTextResult } from 'ai';
import { agentSystemPrompt, buildAgentPlannerPrompt } from '~/lib/modules/agent/prompts';
import type {
  AgentOrchestratorOptions,
  AgentPlan,
  AgentPlanStep,
  AgentRequest,
  AgentResponse,
  AgentTask,
} from '~/lib/modules/agent/types';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AgentOrchestrator');

function extractJson(text: string): any {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const match = trimmed.match(/```json([\s\S]*?)```/i) || trimmed.match(/```([\s\S]*?)```/i);

    if (match && match[1]) {
      const candidate = match[1].trim();
      try {
        return JSON.parse(candidate);
      } catch (inner) {
        logger.warn('Failed to parse JSON from fenced block', inner);
      }
    }

    throw error;
  }
}

function sanitizePlanStep(step: AgentPlanStep, index: number): AgentPlanStep {
  return {
    title: step.title?.trim() || `Step ${index + 1}`,
    description: step.description?.trim(),
    successCriteria: step.successCriteria?.trim(),
    toolHints: Array.isArray(step.toolHints)
      ? step.toolHints.map((hint) => hint.trim()).filter(Boolean)
      : [],
  };
}

export class AgentOrchestrator {
  private readonly env?: Env;
  private readonly apiKeys?: Record<string, string>;
  private readonly providerSettings?: Record<string, IProviderSetting>;
  private readonly defaultProviderName: string;
  private readonly defaultModel: string;

  constructor(options: AgentOrchestratorOptions = {}) {
    this.env = options.env;
    this.apiKeys = options.apiKeys;
    this.providerSettings = options.providerSettings;
    this.defaultProviderName = options.defaultProviderName || DEFAULT_PROVIDER.name;
    this.defaultModel = options.defaultModel || DEFAULT_MODEL;
  }

  async planTask(request: AgentRequest): Promise<AgentResponse> {
    const now = new Date().toISOString();
    const provider = this.resolveProvider(request.provider);
    const modelDetails = await this.resolveModel(provider, request.promptId);

    const plannerPrompt = buildAgentPlannerPrompt({
      goal: request.goal,
      context: request.context?.notes,
      environment: request.context?.environment,
      maxSteps: request.maxSteps,
    });

    let usage: AgentResponse['usage'];

    const resp = await generateText({
      system: agentSystemPrompt,
      prompt: plannerPrompt,
      model: provider.getModelInstance({
        model: modelDetails.name,
        serverEnv: this.env,
        apiKeys: this.apiKeys,
        providerSettings: this.providerSettings,
      }),
    }).then((result: GenerateTextResult<Record<string, CoreTool<any, any>>, never>) => {
      usage = result.usage;
      return result.text;
    });

    const plan = this.normalizePlan(resp);

    const task: AgentTask = {
      id: generateId(),
      goal: request.goal,
      summary: plan.summary,
      provider: provider.name,
      status: 'planned',
      steps: plan.steps.map((step, index) => ({
        id: generateId(),
        title: step.title,
        description: step.description,
        successCriteria: step.successCriteria,
        toolHints: step.toolHints,
        status: 'pending',
      })),
      createdAt: now,
      updatedAt: now,
    };

    return {
      task,
      usage,
    };
  }

  private normalizePlan(raw: string): AgentPlan {
    try {
      const parsed = extractJson(raw) as AgentPlan;

      if (!parsed.steps || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
        throw new Error('Agent plan must include at least one step');
      }

      return {
        summary: parsed.summary?.trim(),
        steps: parsed.steps.map((step, index) => sanitizePlanStep(step, index)),
      };
    } catch (error) {
      logger.error('Failed to normalize agent plan output', error);
      throw new Error('Agent planning failed: invalid response format');
    }
  }

  private resolveProvider(preferred?: string) {
    if (preferred) {
      const match = PROVIDER_LIST.find((provider) => provider.name === preferred);
      if (match) {
        return match;
      }
      logger.warn(`Preferred provider ${preferred} not found; falling back to default provider`);
    }

    const defaultProvider = PROVIDER_LIST.find((provider) => provider.name === this.defaultProviderName);

    if (defaultProvider) {
      return defaultProvider;
    }

    return DEFAULT_PROVIDER;
  }

  private async resolveModel(provider: (typeof PROVIDER_LIST)[number], promptId?: string) {
    const llmManager = LLMManager.getInstance();
    const staticModels = llmManager.getStaticModelListFromProvider(provider);

    if (staticModels.length) {
      const exactMatch = staticModels.find((model) => model.name === this.defaultModel);
      if (exactMatch) {
        return exactMatch;
      }
      return staticModels[0];
    }

    const dynamicModels = await llmManager.getModelListFromProvider(provider, {
      apiKeys: this.apiKeys,
      providerSettings: this.providerSettings,
      serverEnv: this.env as any,
    });

    if (dynamicModels.length === 0) {
      throw new Error(`No models available for provider ${provider.name}`);
    }

    const preferredModel = promptId ? dynamicModels.find((model) => model.name === promptId) : undefined;

    return preferredModel || dynamicModels.find((model) => model.name === this.defaultModel) || dynamicModels[0];
  }
}
