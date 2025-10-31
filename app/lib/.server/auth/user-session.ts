import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { parseCookies } from '~/lib/api/cookies';

const USER_TOKEN_COOKIE = 'bolt_user_token';
const USER_TOKEN_ISSUER = 'bolt-user-auth';
const USER_TOKEN_AUDIENCE = 'bolt-user';
const USER_TOKEN_EXPIRATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

type UserTokenPayload = JWTPayload & {
  sub: string;
  workspaces?: string[];
};

type EnsureUserSessionResult = {
  session: UserSession;
  /**
   * Optional Set-Cookie header value when the session cookie must be refreshed/issued.
   */
  setCookie?: string;
};

export interface UserSession {
  userId: string;
  token: string;
  issuedAt: number;
  expiresAt: number;
  workspaces?: string[];
}

let cachedSecretKey: Uint8Array | null = null;

function getSecretKey(env: Env): Uint8Array {
  if (!cachedSecretKey) {
    if (!env.CODE_SERVER_USER_JWT_SECRET) {
      throw new Error('CODE_SERVER_USER_JWT_SECRET is not configured');
    }

    cachedSecretKey = new TextEncoder().encode(env.CODE_SERVER_USER_JWT_SECRET);
  }

  return cachedSecretKey;
}

export async function verifyUserToken(env: Env, token: string): Promise<UserSession | null> {
  try {
    const secretKey = getSecretKey(env);
    const { payload } = await jwtVerify<UserTokenPayload>(token, secretKey, {
      issuer: USER_TOKEN_ISSUER,
      audience: USER_TOKEN_AUDIENCE,
      algorithms: ['HS256'],
    });

    if (!payload.sub) {
      return null;
    }

    const issuedAt = (payload.iat ?? 0) * 1000;
    const expiresAt = (payload.exp ?? 0) * 1000;

    return {
      userId: payload.sub,
      token,
      issuedAt,
      expiresAt,
      workspaces: Array.isArray(payload.workspaces) ? payload.workspaces : undefined,
    };
  } catch (error) {
    console.warn('[auth] Failed to verify user token', error);
    return null;
  }
}

export async function mintUserToken(env: Env, userId: string, workspaces: string[]): Promise<UserSession> {
  const secretKey = getSecretKey(env);

  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const expirationSeconds = issuedAtSeconds + USER_TOKEN_EXPIRATION_SECONDS;

  const token = await new SignJWT({
    workspaces,
  })
    .setSubject(userId)
    .setIssuer(USER_TOKEN_ISSUER)
    .setAudience(USER_TOKEN_AUDIENCE)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(issuedAtSeconds)
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);

  return {
    userId,
    token,
    issuedAt: issuedAtSeconds * 1000,
    expiresAt: expirationSeconds * 1000,
    workspaces,
  };
}

function buildSessionCookie(token: string, secure: boolean): string {
  const maxAge = USER_TOKEN_EXPIRATION_SECONDS;
  const parts = [
    `${USER_TOKEN_COOKIE}=${token}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ].filter(Boolean);

  return parts.join('; ');
}

export async function ensureUserSession(env: Env, request: Request, workspaceId: string): Promise<EnsureUserSessionResult> {
  const cookieHeader = request.headers.get('Cookie');
  const cookies = parseCookies(cookieHeader);
  const existingToken = cookies[USER_TOKEN_COOKIE];

  const secure = request.url.startsWith('https://');

  if (existingToken) {
    const verified = await verifyUserToken(env, existingToken);

    if (verified) {
      const workspaces = new Set(verified.workspaces ?? []);

      if (!workspaces.has(workspaceId)) {
        workspaces.add(workspaceId);
        const refreshed = await mintUserToken(env, verified.userId, Array.from(workspaces));
        return {
          session: refreshed,
          setCookie: buildSessionCookie(refreshed.token, secure),
        };
      }

      const isExpired = verified.expiresAt <= Date.now();

      if (isExpired) {
        const refreshed = await mintUserToken(env, verified.userId, Array.from(workspaces));
        return {
          session: refreshed,
          setCookie: buildSessionCookie(refreshed.token, secure),
        };
      }

      return {
        session: verified,
      };
    }
  }

  const userId = crypto.randomUUID();
  const minted = await mintUserToken(env, userId, [workspaceId]);

  return {
    session: minted,
    setCookie: buildSessionCookie(minted.token, secure),
  };
}

export async function requireUserSession(env: Env, request: Request): Promise<UserSession> {
  const cookieHeader = request.headers.get('Cookie');
  const cookies = parseCookies(cookieHeader);
  const token = cookies[USER_TOKEN_COOKIE];

  if (!token) {
    throw new Response('Unauthorized', { status: 401 });
  }

  const session = await verifyUserToken(env, token);

  if (!session) {
    throw new Response('Unauthorized', { status: 401 });
  }

  return session;
}

export { USER_TOKEN_COOKIE };
