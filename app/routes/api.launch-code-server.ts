import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { z } from 'zod';
import { withSecurity } from '~/lib/security';
import { resolveRuntimeEnv } from '~/lib/server/env';
import {
  assertWorkspaceAccess,
  authenticateRequest,
  ensureUserMatch,
  requireScope,
  ForbiddenError,
  UnauthorizedError,
} from '~/lib/server/auth.server';
import { launchCodeServerSession } from '~/lib/services/codeServerSessions.server';
import type { CodeServerResourceProfile } from '~/types/codeServer';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.launch-code-server');

const requestSchema = z.object({
  workspace_id: z.string().min(1, 'workspace_id is required'),
  user_id: z.string().min(1, 'user_id is required'),
  resource_profile: z
    .enum(['small', 'medium', 'large'] as [CodeServerResourceProfile, CodeServerResourceProfile, CodeServerResourceProfile])
    .default('medium'),
  preferred_shell: z.enum(['bash', 'zsh', 'fish', 'sh']).optional(),
  ttl_minutes: z.number().int().positive().max(240).optional(),
});

export const action = withSecurity(async (args: ActionFunctionArgs) => {
  const { request, context } = args;
  const env = resolveRuntimeEnv(context);

  try {
    const payload = requestSchema.parse(await request.json());
    const authenticatedUser = await authenticateRequest(request, env);

    ensureUserMatch(authenticatedUser, payload.user_id);
    assertWorkspaceAccess(authenticatedUser, payload.workspace_id);
    requireScope(authenticatedUser, ['code-server:launch', 'code-server:admin', 'workspace:admin']);

    const ttlMinutes = payload.ttl_minutes ?? Number.parseInt(env.CODE_SERVER_DEFAULT_TTL_MINUTES ?? '30', 10);

    const response = await launchCodeServerSession(
      {
        workspaceId: payload.workspace_id,
        userId: payload.user_id,
        resourceProfile: payload.resource_profile,
        preferredShell: payload.preferred_shell,
        ttlMinutes,
      },
      { env, actor: authenticatedUser },
    );

    return json(response, { status: 201 });
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

    logger.error('Failed to launch code-server session', error);
    return json({ error: 'Failed to launch code-server session' }, { status: 500 });
  }
},
{
  rateLimit: true,
  allowedMethods: ['POST'],
});
