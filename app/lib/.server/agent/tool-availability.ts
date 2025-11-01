import { getAgentTools } from '~/lib/modules/agent/registry';
import type { AgentToolDefinition } from '~/lib/modules/agent/types';

const PREREQUISITE_MAP: Record<string, string[]> = {
  git: [],
  'supabase-project': ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  'supabase-service-role': ['SUPABASE_SERVICE_ROLE_KEY'],
  'vercel-api-token': ['VERCEL_ACCESS_TOKEN', 'VERCEL_TOKEN'],
  'netlify-api-token': ['NETLIFY_AUTH_TOKEN'],
  'mcp-server-web': [],
};

interface ToolAvailabilityResult {
  id: string;
  title: string;
  description: string;
  category: AgentToolDefinition['category'];
  prerequisites?: string[];
  available: boolean;
  missingPrerequisites: string[];
  viaEnvironment?: boolean;
}

const getEnvRecord = (env?: Record<string, unknown>): Record<string, string> => {
  const source = env ?? (typeof process !== 'undefined' ? (process.env as Record<string, unknown>) : {});
  const record: Record<string, string> = {};

  if (!source) {
    return record;
  }

  Object.entries(source).forEach(([key, value]) => {
    if (typeof value === 'string') {
      record[key] = value;
    } else if (value != null) {
      record[key] = String(value);
    }
  });

  return record;
};

const resolvePrerequisite = (prerequisite: string, env: Record<string, string>) => {
  const alternatives = prerequisite.split('|').map((item) => item.trim());

  const available = alternatives.some((alt) => {
    const keys = PREREQUISITE_MAP[alt] || [];

    if (keys.length === 0) {
      return true;
    }

    return keys.every((key) => Boolean(env[key]));
  });

  const missing = alternatives.filter((alt) => {
    const keys = PREREQUISITE_MAP[alt] || [];

    if (keys.length === 0) {
      return false;
    }

    return !keys.every((key) => Boolean(env[key]));
  });

  const viaEnvironment = available && alternatives.some((alt) => {
    const keys = PREREQUISITE_MAP[alt] || [];
    return keys.length > 0;
  });

  return { available, missing, viaEnvironment };
};

export const listToolAvailability = (env?: Record<string, unknown>): ToolAvailabilityResult[] => {
  const envRecord = getEnvRecord(env);

  return getAgentTools().map((tool) => {
    const prerequisiteResults = (tool.prerequisites ?? []).map((prerequisite) => resolvePrerequisite(prerequisite, envRecord));

    const available = prerequisiteResults.every((result) => result.available !== false);
    const missing = prerequisiteResults
      .flatMap((result, index) => (result.available ? [] : [tool.prerequisites?.[index] ?? 'onbekend']))
      .filter(Boolean);
    const viaEnvironment = prerequisiteResults.some((result) => result.viaEnvironment);

    return {
      id: tool.id,
      title: tool.title,
      description: tool.description,
      category: tool.category,
      prerequisites: tool.prerequisites,
      available,
      missingPrerequisites: missing,
      viaEnvironment,
    };
  });
};

export type { ToolAvailabilityResult };
