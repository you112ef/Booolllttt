import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { z } from 'zod';
import { requireUserSession } from '~/lib/.server/auth/user-session';
import { getCodeServerStatus } from '~/lib/.server/code-server/service';

const querySchema = z.object({
  session_id: z.string().min(1, 'session_id is required'),
});

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

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const env = context.cloudflare?.env;

  if (!env) {
    throw new Error('Cloudflare environment is not available');
  }

  const userSession = await requireUserSession(env, request);
  const url = new URL(request.url);

  const parsed = querySchema.safeParse({
    session_id: url.searchParams.get('session_id'),
  });

  if (!parsed.success) {
    return json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, { status: 400 });
  }

  const session = await getCodeServerStatus(env, userSession, parsed.data.session_id);
  const absoluteSessionUrl = toAbsoluteUrl(request, session.sessionUrl);
  const absoluteWsTunnel = toAbsoluteUrl(request, session.wsTunnelUrl, true);

  return json({
    session: {
      ...session,
      sessionUrl: absoluteSessionUrl,
      wsTunnelUrl: absoluteWsTunnel,
    },
  });
};

