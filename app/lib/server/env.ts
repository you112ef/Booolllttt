import type { AppLoadContext } from '@remix-run/cloudflare';
import type { KVNamespace } from '@cloudflare/workers-types';
import type { CodeServerConfig, CodeServerPreferredShell, CodeServerResourceProfile } from '~/types/codeServer';

type RuntimeEnv = Record<string, string | undefined> & {
  CODE_SERVER_SESSIONS?: KVNamespace;
};

export function resolveRuntimeEnv(context?: Pick<AppLoadContext, 'cloudflare'>): RuntimeEnv {
  const contextEnv = context?.cloudflare?.env as unknown as RuntimeEnv | undefined;
  const processEnv = process.env as RuntimeEnv | undefined;

  return {
    ...processEnv,
    ...contextEnv,
  };
}

export function getCodeServerConfigFromEnv(env: RuntimeEnv): CodeServerConfig {
  const normalizeList = <T extends string>(value: string | undefined, fallback: T[], mapper?: (item: string) => T): T[] => {
    if (!value) {
      return fallback;
    }

    const values = value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (values.length === 0) {
      return fallback;
    }

    return mapper ? values.map(mapper) : (values as T[]);
  };

  const resourceProfiles = normalizeList<CodeServerResourceProfile>(
    env.CODE_SERVER_RESOURCE_PROFILES,
    ['small', 'medium', 'large'],
    (value) => (['small', 'medium', 'large'].includes(value) ? (value as CodeServerResourceProfile) : 'medium'),
  );

  const preferredShells = normalizeList<CodeServerPreferredShell>(
    env.CODE_SERVER_PREFERRED_SHELLS,
    ['bash', 'zsh'],
    (value) => (['bash', 'zsh', 'fish', 'sh'].includes(value) ? (value as CodeServerPreferredShell) : 'bash'),
  );

  const defaultResourceProfile = resourceProfiles.includes('medium') ? 'medium' : resourceProfiles[0];
  const defaultTtlMinutes = Number.parseInt(env.CODE_SERVER_DEFAULT_TTL_MINUTES ?? '30', 10);
  const statusPollIntervalMs = Number.parseInt(env.CODE_SERVER_STATUS_POLL_INTERVAL ?? '5000', 10);

  return {
    available: Boolean(env.CODE_SERVER_PROVISIONER_URL),
    defaultResourceProfile,
    resourceProfiles,
    defaultTtlMinutes: Number.isNaN(defaultTtlMinutes) ? 30 : Math.min(defaultTtlMinutes, 240),
    preferredShells,
    statusPollIntervalMs: Number.isNaN(statusPollIntervalMs) ? 5000 : statusPollIntervalMs,
  };
}

export type { RuntimeEnv };
