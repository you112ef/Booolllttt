import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { z } from 'zod';
import { requireUserSession } from '~/lib/.server/auth/user-session';
import { stopCodeServer } from '~/lib/.server/code-server/service';

const schema = z.object({
  session_id: z.string().min(1, 'session_id is required'),
  user_id: z.string().min(1, 'user_id is required'),
});

function deleteSessionCookie(sessionId: string, request: Request) {
  const secure = request.url.startsWith('https://');
  const path = `/code-server/session/${sessionId}`;
  const parts = [
    `bolt_code_session_${sessionId}=deleted`,
    `Path=${path}`,
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ].filter(Boolean);

  return parts.join('; ');
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

  await stopCodeServer(env, userSession, parsed.data.session_id);

  return json(
    {
      status: 'stopped',
      session_id: parsed.data.session_id,
      stopped_at: new Date().toISOString(),
    },
    {
      headers: {
        'Set-Cookie': deleteSessionCookie(parsed.data.session_id, request),
      },
    },
  );
};

