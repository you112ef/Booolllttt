import type { CodeServerStatus, StoredCodeServerSession } from './types';

const SESSION_KEY_PREFIX = 'session:';
const WORKSPACE_SESSION_KEY_PREFIX = 'workspace:';

function sessionKey(sessionId: string) {
  return `${SESSION_KEY_PREFIX}${sessionId}`;
}

function workspaceKey(workspaceId: string) {
  return `${WORKSPACE_SESSION_KEY_PREFIX}${workspaceId}`;
}

export async function putSession(env: Env, session: StoredCodeServerSession) {
  await Promise.all([
    env.CODE_SERVER_SESSIONS.put(sessionKey(session.sessionId), JSON.stringify(session)),
    env.CODE_SERVER_SESSIONS.put(workspaceKey(session.workspaceId), session.sessionId),
  ]);
}

export async function getSession(env: Env, sessionId: string): Promise<StoredCodeServerSession | null> {
  const value = await env.CODE_SERVER_SESSIONS.get(sessionKey(sessionId));

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as StoredCodeServerSession;
  } catch (error) {
    console.error('[code-server/session-store] Failed to parse session', error);
    return null;
  }
}

export async function getSessionByWorkspace(env: Env, workspaceId: string): Promise<StoredCodeServerSession | null> {
  const sessionId = await env.CODE_SERVER_SESSIONS.get(workspaceKey(workspaceId));

  if (!sessionId) {
    return null;
  }

  return getSession(env, sessionId);
}

export async function deleteSession(env: Env, session: StoredCodeServerSession) {
  await Promise.all([
    env.CODE_SERVER_SESSIONS.delete(sessionKey(session.sessionId)),
    env.CODE_SERVER_SESSIONS.delete(workspaceKey(session.workspaceId)),
  ]);
}

export async function updateSessionStatus(env: Env, sessionId: string, status: CodeServerStatus) {
  const session = await getSession(env, sessionId);

  if (!session) {
    return;
  }

  session.status = status;
  session.updatedAt = new Date().toISOString();

  await putSession(env, session);
}

