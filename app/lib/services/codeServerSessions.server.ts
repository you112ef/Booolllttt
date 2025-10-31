import { SignJWT, importPKCS8 } from 'jose';
import { z } from 'zod';
import type { AuthenticatedUser } from '~/lib/server/auth.server';
import { createScopedLogger } from '~/utils/logger';
import type { CodeServerSession, CodeServerSessionRequest, StoredCodeServerSession } from '~/types/codeServer';
import type { RuntimeEnv } from '~/lib/server/env';

const logger = createScopedLogger('CodeServerSessions');

const provisionerResponseSchema = z.object({
  session_id: z.string(),
  session_url: z.string().url(),
  ws_tunnel: z.string().url().optional(),
  token: z.string().optional(),
  expires_at: z.string(),
  status: z.enum(['starting', 'running', 'stopped', 'failed']).default('starting'),
});

const statusResponseSchema = z.object({
  session_id: z.string(),
  status: z.enum(['starting', 'running', 'stopped', 'failed']),
  started_at: z.string().optional(),
  pid: z.number().optional(),
});

const inMemorySessionStore = new Map<string, StoredCodeServerSession>();

function nowIso() {
  return new Date().toISOString();
}

function resolveEndpoint(env: RuntimeEnv, pathname: string): string {
  if (!env.CODE_SERVER_PROVISIONER_URL) {
    throw new Error('CODE_SERVER_PROVISIONER_URL is not configured');
  }

  const base = env.CODE_SERVER_PROVISIONER_URL.endsWith('/')
    ? env.CODE_SERVER_PROVISIONER_URL
    : `${env.CODE_SERVER_PROVISIONER_URL}/`;

  return new URL(pathname, base).toString();
}

async function persistSession(env: RuntimeEnv, session: StoredCodeServerSession) {
  const ttlSeconds = Math.max(60, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));

  if (env.CODE_SERVER_SESSIONS) {
    await env.CODE_SERVER_SESSIONS.put(session.sessionId, JSON.stringify(session), {
      expirationTtl: ttlSeconds,
    });
  } else {
    inMemorySessionStore.set(session.sessionId, session);
  }
}

async function removeSession(env: RuntimeEnv, sessionId: string) {
  if (env.CODE_SERVER_SESSIONS) {
    await env.CODE_SERVER_SESSIONS.delete(sessionId);
  }

  inMemorySessionStore.delete(sessionId);
}

async function readSession(env: RuntimeEnv, sessionId: string): Promise<StoredCodeServerSession | null> {
  if (env.CODE_SERVER_SESSIONS) {
    const result = await env.CODE_SERVER_SESSIONS.get(sessionId, 'json');

    if (result) {
      return result as StoredCodeServerSession;
    }
  }

  return inMemorySessionStore.get(sessionId) ?? null;
}

async function generateSessionToken(
  session: CodeServerSession,
  env: RuntimeEnv,
  actor: AuthenticatedUser,
): Promise<string | undefined> {
  const privateKey = env.CODE_SERVER_SESSION_PRIVATE_KEY;

  if (!privateKey) {
    logger.warn('CODE_SERVER_SESSION_PRIVATE_KEY is not configured; falling back to provisioner token');
    return session.token;
  }

  const key = await importPKCS8(privateKey, 'RS256');
  const expiresAt = new Date(session.expiresAt);

  const token = await new SignJWT({
    sid: session.sessionId,
    workspace_id: session.workspaceId,
    sub: actor.userId,
    scopes: actor.scopes,
  })
    .setProtectedHeader({ alg: 'RS256', kid: env.CODE_SERVER_SESSION_KEY_ID })
    .setIssuer(env.CODE_SERVER_SESSION_ISSUER ?? 'bolt.diy')
    .setAudience(env.CODE_SERVER_SESSION_AUDIENCE ?? 'code-server')
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key);

  return token;
}

function createHeaders(env: RuntimeEnv): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (env.CODE_SERVER_PROVISIONER_TOKEN) {
    headers.Authorization = `Bearer ${env.CODE_SERVER_PROVISIONER_TOKEN}`;
  }

  return headers;
}

function mapProvisionerResponse(
  payload: z.infer<typeof provisionerResponseSchema>,
  request: CodeServerSessionRequest,
): CodeServerSession {
  return {
    sessionId: payload.session_id,
    sessionUrl: payload.session_url,
    wsTunnel: payload.ws_tunnel,
    token: payload.token,
    expiresAt: payload.expires_at,
    status: payload.status,
    workspaceId: request.workspaceId,
    userId: request.userId,
  };
}

export async function launchCodeServerSession(
  request: CodeServerSessionRequest,
  options: { env: RuntimeEnv; actor: AuthenticatedUser; requestId?: string },
): Promise<CodeServerSession> {
  const { env, actor, requestId } = options;
  const endpoint = resolveEndpoint(env, 'launch');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: createHeaders(env),
    body: JSON.stringify({
      workspace_id: request.workspaceId,
      user_id: request.userId,
      resource_profile: request.resourceProfile,
      preferred_shell: request.preferredShell,
      ttl_minutes: request.ttlMinutes,
      request_id: requestId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error('Provisioner launch failed', { status: response.status, response: text });
    throw new Error(`Failed to provision code-server session (${response.status})`);
  }

  const payload = provisionerResponseSchema.parse(await response.json());
  const session = mapProvisionerResponse(payload, request);
  const sessionToken = await generateSessionToken(session, env, actor);
  const storedSession: StoredCodeServerSession = {
    ...session,
    token: sessionToken,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await persistSession(env, storedSession);

  return {
    ...session,
    token: sessionToken,
  };
}

export async function stopCodeServerSession(
  sessionId: string,
  env: RuntimeEnv,
  actor: AuthenticatedUser,
): Promise<{ status: string; stoppedAt: string }> {
  const endpoint = resolveEndpoint(env, 'stop');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: createHeaders(env),
    body: JSON.stringify({ session_id: sessionId, user_id: actor.userId }),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error('Provisioner stop failed', { status: response.status, response: text });
    throw new Error(`Failed to stop code-server session (${response.status})`);
  }

  await removeSession(env, sessionId);

  return {
    status: 'stopped',
    stoppedAt: nowIso(),
  };
}

export async function getCodeServerSessionStatus(
  sessionId: string,
  env: RuntimeEnv,
  actor: AuthenticatedUser,
): Promise<StoredCodeServerSession | null> {
  const storedSession = await readSession(env, sessionId);

  if (!env.CODE_SERVER_PROVISIONER_URL) {
    return storedSession;
  }

  const endpoint = resolveEndpoint(env, `status?session_id=${encodeURIComponent(sessionId)}`);

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: createHeaders(env),
  });

  if (!response.ok) {
    logger.warn('Provisioner status lookup failed', { status: response.status });
    return storedSession;
  }

  const payload = statusResponseSchema.parse(await response.json());
  const updatedSession: StoredCodeServerSession | null = storedSession
    ? {
        ...storedSession,
        status: payload.status,
        updatedAt: nowIso(),
      }
    : null;

  if (updatedSession) {
    await persistSession(env, updatedSession);
  } else if (payload.status === 'running') {
    logger.warn('Status returned running but no stored session could be found', {
      sessionId,
      userId: actor.userId,
    });
  }

  return updatedSession;
}
