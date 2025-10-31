import { importPKCS8, importSPKI, SignJWT, jwtVerify, type KeyLike } from 'jose';
import type { SessionTokenPayload } from './types';

const SESSION_TOKEN_ALG = 'RS256';

interface CachedKeys {
  privateKey?: KeyLike;
  publicKey?: KeyLike;
}

const cachedKeys: CachedKeys = {};

async function getPrivateKey(env: Env): Promise<KeyLike> {
  if (!cachedKeys.privateKey) {
    const privateKeyPem = env.CODE_SERVER_JWT_PRIVATE_KEY;

    if (!privateKeyPem) {
      throw new Error('CODE_SERVER_JWT_PRIVATE_KEY is not configured');
    }

    cachedKeys.privateKey = await importPKCS8(privateKeyPem, SESSION_TOKEN_ALG);
  }

  return cachedKeys.privateKey;
}

async function getPublicKey(env: Env): Promise<KeyLike> {
  if (!cachedKeys.publicKey) {
    const publicKeyPem = env.CODE_SERVER_JWT_PUBLIC_KEY || env.CODE_SERVER_JWT_PRIVATE_KEY;

    if (!publicKeyPem) {
      throw new Error('CODE_SERVER_JWT_PUBLIC_KEY or CODE_SERVER_JWT_PRIVATE_KEY must be provided');
    }

    if (publicKeyPem.includes('BEGIN PRIVATE KEY')) {
      cachedKeys.publicKey = await importPKCS8(publicKeyPem, SESSION_TOKEN_ALG);
    } else {
      cachedKeys.publicKey = await importSPKI(publicKeyPem, SESSION_TOKEN_ALG);
    }
  }

  return cachedKeys.publicKey;
}

export async function signSessionToken(env: Env, payload: SessionTokenPayload, ttlSeconds: number): Promise<{
  token: string;
  expiresAt: string;
  issuedAt: string;
}> {
  const privateKey = await getPrivateKey(env);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = nowSeconds + ttlSeconds;

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: SESSION_TOKEN_ALG, kid: env.CODE_SERVER_JWT_KID, typ: 'JWT' })
    .setIssuer(env.CODE_SERVER_JWT_ISSUER)
    .setAudience(env.CODE_SERVER_JWT_AUDIENCE)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(expiresAtSeconds)
    .sign(privateKey);

  return {
    token,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    issuedAt: new Date(nowSeconds * 1000).toISOString(),
  };
}

export async function verifySessionToken(env: Env, token: string): Promise<SessionTokenPayload | null> {
  try {
    const publicKey = await getPublicKey(env);
    const { payload } = await jwtVerify<SessionTokenPayload>(token, publicKey, {
      issuer: env.CODE_SERVER_JWT_ISSUER,
      audience: env.CODE_SERVER_JWT_AUDIENCE,
      algorithms: [SESSION_TOKEN_ALG],
    });

    return payload;
  } catch (error) {
    console.warn('[code-server/jwt] Failed to verify session token', error);
    return null;
  }
}

