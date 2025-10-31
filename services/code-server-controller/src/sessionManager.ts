import type { ControllerConfig } from './config';
import { provisionContainer, stopAndRemoveContainer } from './docker';

export type SessionStatus = 'starting' | 'running' | 'stopped' | 'failed';

export interface CreateSessionInput {
  sessionId: string;
  workspaceId: string;
  userId: string;
  resourceProfile: string;
  preferredShell: string;
  ttlMinutes: number;
}

export interface ManagedSession {
  sessionId: string;
  workspaceId: string;
  userId: string;
  status: SessionStatus;
  resourceProfile: string;
  preferredShell: string;
  containerId: string;
  httpUrl: string;
  wsUrl: string;
  startedAt: string;
  expiresAt: string;
  password: string;
  hostPort: number;
  ttlTimer?: NodeJS.Timeout;
}

export class SessionManager {
  #config: ControllerConfig;
  #sessions = new Map<string, ManagedSession>();

  constructor(config: ControllerConfig) {
    this.#config = config;
  }

  get(sessionId: string) {
    return this.#sessions.get(sessionId);
  }

  list() {
    return Array.from(this.#sessions.values());
  }

  async createOrReuseSession(input: CreateSessionInput): Promise<ManagedSession> {
    const existing = this.#sessions.get(input.sessionId);

    if (existing && existing.status !== 'stopped') {
      this.#refreshTtl(existing, input.ttlMinutes);
      return existing;
    }

    const resource = this.#config.resourceProfiles[input.resourceProfile] || this.#config.resourceProfiles.small;

    const provision = await provisionContainer(this.#config, {
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      resourceProfile: resource,
      preferredShell: input.preferredShell,
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.ttlMinutes * 60_000);

    const session: ManagedSession = {
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      status: 'running',
      resourceProfile: input.resourceProfile,
      preferredShell: input.preferredShell,
      containerId: provision.container.id,
      httpUrl: `${this.#config.publicUrl.replace(/\/$/, '')}/proxy/${input.sessionId}`,
      wsUrl: `${this.#config.publicUrl.replace(/\/$/, '')}/proxy/${input.sessionId}`,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      password: provision.password,
      hostPort: provision.hostPort,
    };

    this.#sessions.set(input.sessionId, session);
    this.#refreshTtl(session, input.ttlMinutes);

    return session;
  }

  async stop(sessionId: string) {
    const session = this.#sessions.get(sessionId);

    if (!session) {
      return;
    }

    if (session.ttlTimer) {
      clearTimeout(session.ttlTimer);
    }

    await stopAndRemoveContainer(sessionId);
    session.status = 'stopped';
    session.expiresAt = new Date().toISOString();
    this.#sessions.delete(sessionId);
  }

  #refreshTtl(session: ManagedSession, ttlMinutes: number) {
    if (session.ttlTimer) {
      clearTimeout(session.ttlTimer);
    }

    const ttlMs = ttlMinutes * 60_000;

    session.expiresAt = new Date(Date.now() + ttlMs).toISOString();

    session.ttlTimer = setTimeout(async () => {
      try {
        await this.stop(session.sessionId);
      } catch (error) {
        console.error('Failed to stop session during TTL cleanup', error);
      }
    }, ttlMs);
  }
}

