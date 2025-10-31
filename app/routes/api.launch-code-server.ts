import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { z } from 'zod';
import { requireUserSession } from '~/lib/.server/auth/user-session';
import { launchCodeServer } from '~/lib/.server/code-server/service';
import type { CodeServerSession } from '~/types/code-server';

const schema = z.object({
  workspace_id: z.string().min(1, 'workspace_id is required'),
  user_id: z.string().min(1, 'user_id is required'),
  resource_profile: z.string().optional(),
  preferred_shell: z.string().optional(),
  ttl_minutes: z.number().int().positive().optional(),
  reconnect: z.boolean().optional(),
});

function createSessionCookie(session: CodeServerSession, request: Request) {
  const secure = request.url.startsWith('https://');
  const expiresInSeconds = Math.max(
    60,
    Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
  );
  const parts = [
    `bolt_code_session_${session.sessionId}=${session.token}`,
    `Path=${session.sessionUrl}`,
    `Max-Age=${expiresInSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ].filter(Boolean);

  return parts.join('; ');
}

function toAbsoluteUrl(request: Request, path: string, preferWebsocket = false) {
  if (/^https?:\/\//.test(path) || /^wss?:\/\//.test(path)) {
    return path;
  }

  const url = new URL(path, request.url);

  if (preferWebsocket) {
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  }

  return url.toString();
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const env = context.cloudflare?.env;

  if (!env) {
    throw new Error('Cloudflare environment is not available');
  }

  const userSession = await requireUserSession(env, request);

  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.user_id !== userSession.userId) {
    return json({ error: 'Forbidden: user mismatch' }, { status: 403 });
  }

  const session = await launchCodeServer(env, userSession, {
    workspaceId: parsed.data.workspace_id,
    userId: parsed.data.user_id,
    resourceProfile: parsed.data.resource_profile,
    preferredShell: parsed.data.preferred_shell,
    ttlMinutes: parsed.data.ttl_minutes,
    reconnect: parsed.data.reconnect,
  });

  const setCookie = createSessionCookie(session, request);
  const absoluteSessionUrl = toAbsoluteUrl(request, session.sessionUrl);
  const absoluteWsTunnel = toAbsoluteUrl(request, session.wsTunnelUrl, true);

  return json(
    {
      session: {
        ...session,
        sessionUrl: absoluteSessionUrl,
        wsTunnelUrl: absoluteWsTunnel,
      },
    },
    {
      headers: {
        'Set-Cookie': setCookie,
      },
    },
  );
};

