import { existsSync, mkdirSync } from 'fs';
import path from 'path';

export interface ResourceProfileConfig {
  cpu: number;
  memory: string;
}

export interface ControllerConfig {
  port: number;
  host: string;
  publicUrl: string;
  jwtPublicKey: string;
  workspaceRoot: string;
  dataRoot: string;
  codeServerImage: string;
  defaultTtlMinutes: number;
  autoCleanupIntervalSeconds: number;
  resourceProfiles: Record<string, ResourceProfileConfig>;
  apiToken?: string;
}

function ensureDirectory(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getenv(name: string, fallback?: string) {
  const value = process.env[name];

  if (!value) {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

export function loadConfig(): ControllerConfig {
  const port = Number(process.env.CONTROLLER_PORT || '8787');
  const host = process.env.CONTROLLER_HOST || `0.0.0.0:${port}`;
  const jwtPublicKey = getenv('CODE_SERVER_JWT_PUBLIC_KEY');
  const workspaceRoot = process.env.WORKSPACE_ROOT || path.resolve(process.cwd(), 'workspaces');
  const dataRoot = process.env.CODE_SERVER_DATA_ROOT || path.resolve(process.cwd(), 'code-server-data');
  const codeServerImage = process.env.CODE_SERVER_IMAGE || 'codercom/code-server:latest';
  const defaultTtlMinutes = Number(process.env.CODE_SERVER_DEFAULT_TTL || '30');
  const autoCleanupIntervalSeconds = Number(process.env.CODE_SERVER_CLEANUP_INTERVAL || '60');
  const apiToken = process.env.CONTROLLER_API_TOKEN;
  const publicUrl = process.env.CONTROLLER_PUBLIC_URL || `http://localhost:${port}`;

  const resourceProfiles: Record<string, ResourceProfileConfig> = {
    small: {
      cpu: Number(process.env.CODE_SERVER_PROFILE_SMALL_CPU || '0.5'),
      memory: process.env.CODE_SERVER_PROFILE_SMALL_MEMORY || '512m',
    },
    medium: {
      cpu: Number(process.env.CODE_SERVER_PROFILE_MEDIUM_CPU || '1'),
      memory: process.env.CODE_SERVER_PROFILE_MEDIUM_MEMORY || '1g',
    },
    large: {
      cpu: Number(process.env.CODE_SERVER_PROFILE_LARGE_CPU || '2'),
      memory: process.env.CODE_SERVER_PROFILE_LARGE_MEMORY || '4g',
    },
  };

  ensureDirectory(workspaceRoot);
  ensureDirectory(dataRoot);

  return {
    port,
    host,
    publicUrl,
    jwtPublicKey,
    workspaceRoot,
    dataRoot,
    codeServerImage,
    defaultTtlMinutes,
    autoCleanupIntervalSeconds,
    resourceProfiles,
    apiToken,
  };
}

