import { recordAuditEvent } from './audit';
import { requestLaunch, requestStatus, requestStop } from './controller-client';
import { ensureWorkspaceAccess } from './permissions';
import { putSession, getSessionByWorkspace, getSession, deleteSession } from './session-store';
import { signSessionToken } from './jwt';
import type {
  CodeServerSession,
  ControllerLaunchResponse,
  LaunchCodeServerInput,
  ResourceProfile,
  StoredCodeServerSession,
} from './types';
import type { UserSession } from '../auth/user-session';

const DEFAULT_PREFERRED_SHELL = 'bash';
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 240;

function parseAllowedProfiles(env: Env): ResourceProfile[] {
  return (env.CODE_SERVER_ALLOWED_RESOURCE_PROFILES || 'small,medium,large')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

function resolveResourceProfile(env: Env, requested?: ResourceProfile): ResourceProfile {
  const allowed = parseAllowedProfiles(env);
  const fallback = env.CODE_SERVER_DEFAULT_RESOURCE_PROFILE || allowed[0] || 'medium';

  if (requested && allowed.includes(requested)) {
    return requested;
  }

  return fallback;
}

function resolveTtlMinutes(env: Env, requested?: number): number {
  const defaultTtl = Number(env.CODE_SERVER_SESSION_TTL_MINUTES || '30');
  const ttl = requested ?? defaultTtl;
  const normalized = Math.min(Math.max(ttl, MIN_TTL_MINUTES), MAX_TTL_MINUTES);

  return Number.isFinite(normalized) ? normalized : defaultTtl;
}

function buildSessionUrl(sessionId: string) {
  return `/code-server/session/${sessionId}`;
}

function sanitizeSession(session: StoredCodeServerSession): CodeServerSession {
  const { tokenId: _tokenId, tokenIssuedAt: _tokenIssuedAt, ...rest } = session;
  return rest;
}

async function buildStoredSession(
  env: Env,
  launch: ControllerLaunchResponse,
  input: LaunchCodeServerInput,
  resourceProfile: ResourceProfile,
  tokenTtlSeconds: number,
): Promise<StoredCodeServerSession> {
  const sessionUrl = buildSessionUrl(launch.sessionId);
  const wsTunnelUrl = `${sessionUrl}/ws`;
  const preferredShell = launch.preferredShell || input.preferredShell || DEFAULT_PREFERRED_SHELL;

  const tokenPayload = {
    sessionId: launch.sessionId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    scope: ['code-server:connect'],
  } as const;

  const { token, expiresAt, issuedAt } = await signSessionToken(env, tokenPayload, tokenTtlSeconds);

  const stored: StoredCodeServerSession = {
    sessionId: launch.sessionId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    status: launch.status,
    resourceProfile,
    preferredShell,
    sessionUrl,
    wsTunnelUrl,
    token,
    expiresAt,
    createdAt: launch.startedAt,
    updatedAt: issuedAt,
    tokenId: crypto.randomUUID(),
    tokenIssuedAt: issuedAt,
    controller: {
      sessionId: launch.sessionId,
      containerId: launch.containerId,
      httpUrl: launch.httpUrl,
      wsUrl: launch.wsUrl,
      startedAt: launch.startedAt,
      expiresAt: launch.expiresAt,
      status: launch.status,
      logsPath: launch.logsPath,
      metricsEndpoint: launch.metricsEndpoint,
      healthEndpoint: launch.healthEndpoint,
    },
  };

  return stored;
}

async function refreshSessionToken(env: Env, session: StoredCodeServerSession, ttlSeconds: number) {
  const { token, expiresAt, issuedAt } = await signSessionToken(env, {
    sessionId: session.sessionId,
    workspaceId: session.workspaceId,
    userId: session.userId,
    scope: ['code-server:connect'],
  }, ttlSeconds);

  session.token = token;
  session.expiresAt = expiresAt;
  session.updatedAt = issuedAt;
  session.tokenIssuedAt = issuedAt;
  session.tokenId = crypto.randomUUID();
}

async function shouldReuseSession(session: StoredCodeServerSession): Promise<boolean> {
  if (session.status === 'stopped' || session.status === 'failed') {
    return false;
  }

  const expiresAt = new Date(session.expiresAt).getTime();

  return expiresAt > Date.now();
}

export async function launchCodeServer(
  env: Env,
  userSession: UserSession,
  input: LaunchCodeServerInput,
): Promise<CodeServerSession> {
  await ensureWorkspaceAccess(env, userSession, input.workspaceId);

  const resourceProfile = resolveResourceProfile(env, input.resourceProfile);
  const ttlMinutes = resolveTtlMinutes(env, input.ttlMinutes);
  const ttlSeconds = ttlMinutes * 60;

  if (input.reconnect !== false) {
    const existing = await getSessionByWorkspace(env, input.workspaceId);

    if (existing && (await shouldReuseSession(existing))) {
      try {
        const controllerStatus = await requestStatus(env, existing.sessionId);
        existing.status = controllerStatus.status;
        existing.controller.status = controllerStatus.status;
        existing.controller.httpUrl = controllerStatus.httpUrl;
        existing.controller.wsUrl = controllerStatus.wsUrl;
        existing.controller.expiresAt = controllerStatus.expiresAt;
        existing.controller.logsPath = controllerStatus.logsPath;
        existing.controller.metricsEndpoint = controllerStatus.metricsEndpoint;
        existing.controller.healthEndpoint = controllerStatus.healthEndpoint;
      } catch (error) {
        console.warn('[code-server/service] Failed to fetch controller status for existing session', error);
      }

      await refreshSessionToken(env, existing, ttlSeconds);
      await putSession(env, existing);

      await recordAuditEvent(env, {
        type: 'start',
        sessionId: existing.sessionId,
        workspaceId: existing.workspaceId,
        userId: existing.userId,
        timestamp: new Date().toISOString(),
        status: existing.status,
        details: { reused: true },
      });

      return sanitizeSession(existing);
    }

    if (existing) {
      await deleteSession(env, existing);
    }
  }

  const sessionId = crypto.randomUUID();
  const launchResponse = await requestLaunch(env, sessionId, {
    ...input,
    resourceProfile,
    ttlMinutes,
  });

  const stored = await buildStoredSession(env, launchResponse, input, resourceProfile, ttlSeconds);

  await putSession(env, stored);

  await recordAuditEvent(env, {
    type: 'start',
    sessionId: stored.sessionId,
    workspaceId: stored.workspaceId,
    userId: stored.userId,
    timestamp: new Date().toISOString(),
    status: stored.status,
    details: { resourceProfile, ttlMinutes },
  });

  return sanitizeSession(stored);
}

export async function stopCodeServer(env: Env, userSession: UserSession, sessionId: string) {
  const session = await getSession(env, sessionId);

  if (!session) {
    throw new Response('Not Found', { status: 404 });
  }

  await ensureWorkspaceAccess(env, userSession, session.workspaceId);

  await requestStop(env, sessionId);

  await recordAuditEvent(env, {
    type: 'stop',
    sessionId: session.sessionId,
    workspaceId: session.workspaceId,
    userId: session.userId,
    timestamp: new Date().toISOString(),
    status: 'stopped',
  });

  await deleteSession(env, session);
}

export async function getCodeServerStatus(env: Env, userSession: UserSession, sessionId: string) {
  const session = await getSession(env, sessionId);

  if (!session) {
    throw new Response('Not Found', { status: 404 });
  }

  await ensureWorkspaceAccess(env, userSession, session.workspaceId);

  try {
    const controllerStatus = await requestStatus(env, sessionId);

    session.status = controllerStatus.status;
    session.updatedAt = new Date().toISOString();
    session.controller.status = controllerStatus.status;
    session.controller.wsUrl = controllerStatus.wsUrl;
    session.controller.httpUrl = controllerStatus.httpUrl;
    session.controller.logsPath = controllerStatus.logsPath;
    session.controller.metricsEndpoint = controllerStatus.metricsEndpoint;
    session.controller.healthEndpoint = controllerStatus.healthEndpoint;
    session.controller.expiresAt = controllerStatus.expiresAt;

    await putSession(env, session);
  } catch (error) {
    console.warn('[code-server/service] Failed to refresh controller status', error);
  }

  await recordAuditEvent(env, {
    type: 'status',
    sessionId: session.sessionId,
    workspaceId: session.workspaceId,
    userId: session.userId,
    timestamp: new Date().toISOString(),
    status: session.status,
  });

  return sanitizeSession(session);
}

