import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
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
import { getCodeServerSessionStatus, stopCodeServerSession } from '~/lib/services/codeServerSessions.server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.stop-code-server');

const requestSchema = z.object({
  session_id: z.string().min(1, 'session_id is required'),
  user_id: z.string().min(1, 'user_id is required'),
});

export const action = withSecurity(async (args: ActionFunctionArgs) => {
  const { request, context } = args;
  const env = resolveRuntimeEnv(context);

  try {
    const payload = requestSchema.parse(await request.json());
    const authenticatedUser = await authenticateRequest(request, env);

    if (authenticatedUser.userId !== payload.user_id) {
      requireScope(authenticatedUser, ['code-server:admin', 'workspace:admin']);
    }

    requireScope(authenticatedUser, ['code-server:stop', 'code-server:admin', 'workspace:admin']);

    const session = await getCodeServerSessionStatus(payload.session_id, env, authenticatedUser);

    if (!session) {
      return json({ error: 'Session not found' }, { status: 404 });
    }

    assertWorkspaceAccess(authenticatedUser, session.workspaceId);

    if (authenticatedUser.userId !== session.userId) {
      requireScope(authenticatedUser, ['code-server:admin', 'workspace:admin', 'code-server:stop']);
    }

    const result = await stopCodeServerSession(payload.session_id, env, authenticatedUser);

    return json({ session_id: payload.session_id, status: result.status, stopped_at: result.stoppedAt });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return json({ error: error.message }, { status: error.status });
    }

    if (error instanceof ForbiddenError) {
      return json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return json({ error: 'Invalid request payload', details: error.flatten() }, { status: 400 });
    }

    logger.error('Failed to stop code-server session', error);
    return json({ error: 'Failed to stop code-server session' }, { status: 500 });
  }
},
{
  rateLimit: true,
  allowedMethods: ['POST'],
});
