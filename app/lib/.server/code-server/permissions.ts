import type { UserSession } from '../auth/user-session';

export async function ensureWorkspaceAccess(env: Env, session: UserSession, workspaceId: string) {
  if (!session.workspaces?.includes(workspaceId)) {
    throw new Response('Forbidden', { status: 403 });
  }

  if (!env.CODE_SERVER_PERMISSIONS_URL) {
    return;
  }

  try {
    const response = await fetch(`${env.CODE_SERVER_PERMISSIONS_URL.replace(/\/$/, '')}/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.CODE_SERVER_PERMISSIONS_TOKEN
          ? { Authorization: `Bearer ${env.CODE_SERVER_PERMISSIONS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        userId: session.userId,
        workspaceId,
        scopes: ['read', 'write'],
      }),
    });

    if (!response.ok) {
      console.warn('[code-server/permissions] Permission check failed', response.status);
      throw new Response('Forbidden', { status: 403 });
    }

    const result = (await response.json()) as { allowed?: boolean };

    if (!result.allowed) {
      throw new Response('Forbidden', { status: 403 });
    }
  } catch (error) {
    console.error('[code-server/permissions] Permission check error', error);
    throw new Response('Forbidden', { status: 403 });
  }
}

