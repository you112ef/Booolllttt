import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { z } from 'zod';
import { withSecurity } from '~/lib/security';
import { resolveRuntimeEnv } from '~/lib/server/env';
import {
  assertWorkspaceAccess,
  authenticateRequest,
  requireScope,
  ForbiddenError,
  UnauthorizedError,
} from '~/lib/server/auth.server';
import { getCodeServerSessionStatus } from '~/lib/services/codeServerSessions.server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.code-server-status');

const querySchema = z.object({
  session_id: z.string().min(1, 'session_id is required'),
});

export const loader = withSecurity(async (args: LoaderFunctionArgs) => {
  const { request, context } = args;
  const env = resolveRuntimeEnv(context);

  try {
    const url = new URL(request.url);
    const query = querySchema.parse({ session_id: url.searchParams.get('session_id') ?? '' });
    const authenticatedUser = await authenticateRequest(request, env);

    requireScope(authenticatedUser, ['code-server:status', 'code-server:admin', 'workspace:admin', 'code-server:launch']);

    const session = await getCodeServerSessionStatus(query.session_id, env, authenticatedUser);

    if (!session) {
      return json({ session_id: query.session_id, status: 'stopped' });
    }

    assertWorkspaceAccess(authenticatedUser, session.workspaceId);

    return json({
      session_id: session.sessionId,
      status: session.status,
      session_url: session.sessionUrl,
      ws_tunnel: session.wsTunnel,
      token: session.token,
      expires_at: session.expiresAt,
      workspace_id: session.workspaceId,
      user_id: session.userId,
      updated_at: session.updatedAt,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return json({ error: error.message }, { status: error.status });
    }

    if (error instanceof ForbiddenError) {
      return json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return json({ error: 'Invalid request query', details: error.flatten() }, { status: 400 });
    }

    logger.error('Failed to fetch code-server status', error);
    return json({ error: 'Failed to fetch code-server status' }, { status: 500 });
  }
},
{
  rateLimit: true,
  allowedMethods: ['GET'],
});
