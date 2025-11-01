import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { AgentOrchestrator } from '~/lib/.server/agent/orchestrator';
import type { AgentRequest } from '~/lib/modules/agent/types';
import type { IProviderConfig, IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.agent.run');

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, rawCookie) => {
    const [name, ...valueParts] = rawCookie.trim().split('=');

    if (!name || valueParts.length === 0) {
      return acc;
    }

    try {
      const value = decodeURIComponent(valueParts.join('='));
      acc[name] = value;
    } catch (error) {
      logger.warn('Failed to decode cookie value', { name, error });
    }

    return acc;
  }, {});
}

function safeJsonParse<T>(value: string | undefined): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    logger.error('Failed to parse JSON cookie', error);
    return undefined;
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let payload: AgentRequest | undefined;

  try {
    payload = (await request.json()) as AgentRequest;
  } catch (error) {
    logger.error('Invalid JSON payload received', error);
    return json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (!payload?.goal || typeof payload.goal !== 'string') {
    return json({ error: 'Missing goal' }, { status: 400 });
  }

  const cookies = parseCookies(request.headers.get('Cookie'));
  const apiKeys = safeJsonParse<Record<string, string>>(cookies.apiKeys) ?? {};
  const providerConfigMap = safeJsonParse<Record<string, IProviderConfig>>(cookies.providers) ?? {};
  const providerSettings = Object.entries(providerConfigMap).reduce<Record<string, IProviderSetting>>((acc, [key, value]) => {
    if (value?.settings) {
      acc[key] = value.settings;
    }
    return acc;
  }, {});

  const orchestrator = new AgentOrchestrator({
    env: context.cloudflare?.env,
    apiKeys,
    providerSettings,
  });

  try {
    const response = await orchestrator.planTask(payload);
    return json(response);
  } catch (error) {
    logger.error('Agent planning failed', error);
    return json({ error: error instanceof Error ? error.message : 'Agent planning failed' }, { status: 500 });
  }
}
