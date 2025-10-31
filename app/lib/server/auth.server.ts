import { importSPKI, jwtVerify, errors as joseErrors } from 'jose';
import { z } from 'zod';
import { resolveRuntimeEnv, type RuntimeEnv } from './env';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CodeServerAuth');

const payloadSchema = z.object({
  sub: z.string().min(1),
  workspace_id: z.string().optional(),
  workspace_ids: z.array(z.string()).optional(),
  scopes: z.union([z.string(), z.array(z.string())]).optional(),
  email: z.string().optional(),
});

export class UnauthorizedError extends Error {
  status = 401 as const;
}

export class ForbiddenError extends Error {
  status = 403 as const;
}

export interface AuthenticatedUser {
  userId: string;
  email?: string;
  scopes: string[];
  workspaceIds: string[];
  token: string;
  rawPayload: Record<string, unknown>;
}

let cachedPublicKey: CryptoKey | undefined;
let cachedPublicKeyValue: string | undefined;

function getAuthToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization') ?? request.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  const fallback = request.headers.get('X-Bolt-Authorization');

  if (fallback?.startsWith('Bearer ')) {
    return fallback.slice('Bearer '.length).trim();
  }

  return null;
}

async function resolvePublicKey(env: RuntimeEnv): Promise<CryptoKey> {
  const publicKey = env.AUTH_JWT_PUBLIC_KEY ?? env.CODE_SERVER_AUTH_PUBLIC_KEY;

  if (!publicKey) {
    throw new UnauthorizedError('Missing authentication public key');
  }

  if (cachedPublicKey && cachedPublicKeyValue === publicKey) {
    return cachedPublicKey;
  }

  cachedPublicKeyValue = publicKey;
  cachedPublicKey = await importSPKI(publicKey, 'RS256');

  return cachedPublicKey;
}

function parseScopes(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter((scope): scope is string => typeof scope === 'string');
  }

  if (typeof value === 'string') {
    return value.split(/[\s,]+/).filter((scope) => scope.length > 0);
  }

  return [];
}

export async function authenticateRequest(request: Request, envInput?: RuntimeEnv): Promise<AuthenticatedUser> {
  const env = envInput ?? resolveRuntimeEnv();
  const token = getAuthToken(request);

  if (!token) {
    throw new UnauthorizedError('Missing Authorization header');
  }

  try {
    const publicKey = await resolvePublicKey(env);
    const audience = env.AUTH_JWT_AUDIENCE?.split(',').map((value) => value.trim()).filter(Boolean);
    const issuer = env.AUTH_JWT_ISSUER?.split(',').map((value) => value.trim()).filter(Boolean);

    const verification = await jwtVerify(token, publicKey, {
      audience: audience && audience.length > 0 ? audience : undefined,
      issuer: issuer && issuer.length > 0 ? issuer : undefined,
    });

    const payload = payloadSchema.parse(verification.payload);
    const workspaceIds = new Set<string>();

    if (payload.workspace_id) {
      workspaceIds.add(payload.workspace_id);
    }

    if (payload.workspace_ids) {
      payload.workspace_ids.forEach((workspaceId) => workspaceIds.add(workspaceId));
    }

    const scopes = parseScopes(payload.scopes);

    return {
      userId: payload.sub,
      email: payload.email,
      scopes,
      workspaceIds: Array.from(workspaceIds),
      token,
      rawPayload: verification.payload as Record<string, unknown>,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    if (error instanceof joseErrors.JWTExpired) {
      logger.warn('JWT expired');
      throw new UnauthorizedError('Session expired');
    }

    logger.error('Failed to verify JWT', error);
    throw new UnauthorizedError('Invalid authentication token');
  }
}

export function assertWorkspaceAccess(authenticatedUser: AuthenticatedUser, workspaceId: string) {
  if (!workspaceId) {
    throw new ForbiddenError('Workspace identifier is required');
  }

  if (authenticatedUser.workspaceIds.includes(workspaceId)) {
    return;
  }

  const scopedAccess = authenticatedUser.scopes.find((scope) => {
    if (!scope.startsWith('workspace:')) {
      return false;
    }

    const [, scopeWorkspaceId, permission] = scope.split(':');
    return scopeWorkspaceId === workspaceId && ['rw', 'admin', 'owner'].includes(permission ?? '');
  });

  if (!scopedAccess) {
    throw new ForbiddenError('Insufficient workspace permissions');
  }
}

export function requireScope(authenticatedUser: AuthenticatedUser, scopes: string | string[]) {
  const scopeList = Array.isArray(scopes) ? scopes : [scopes];

  const hasScope = scopeList.some((scope) => authenticatedUser.scopes.includes(scope));

  if (!hasScope) {
    throw new ForbiddenError('Missing required scope');
  }
}

export function ensureUserMatch(authenticatedUser: AuthenticatedUser, userId: string) {
  if (authenticatedUser.userId !== userId) {
    throw new ForbiddenError('Authenticated user does not match request payload');
  }
}
