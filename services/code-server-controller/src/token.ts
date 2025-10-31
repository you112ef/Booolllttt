import { importSPKI, jwtVerify, type KeyLike } from 'jose';

export interface SessionTokenPayload {
  sessionId: string;
  workspaceId: string;
  userId: string;
  scope: string[];
}

let cachedKey: KeyLike | null = null;

export async function getPublicKey(pem: string) {
  if (!cachedKey) {
    cachedKey = await importSPKI(pem, 'RS256');
  }

  return cachedKey;
}

export async function verifyToken(pem: string, token: string): Promise<SessionTokenPayload | null> {
  try {
    const key = await getPublicKey(pem);
    const { payload } = await jwtVerify<SessionTokenPayload>(token, key);
    return payload;
  } catch (error) {
    return null;
  }
}

