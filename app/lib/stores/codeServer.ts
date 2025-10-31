import { map } from 'nanostores';
import type { CodeServerSession } from '~/types/code-server';

type CodeServerUiStatus = 'idle' | 'starting' | 'ready' | 'connected' | 'stopping' | 'error';

interface CodeServerStoreState {
  initialized: boolean;
  userId?: string;
  workspaceId?: string;
  resourceProfiles: string[];
  defaultResourceProfile: string;
  sessionTtlMinutes: number;
  status: CodeServerUiStatus;
  session?: CodeServerSession;
  error?: string;
  lastStatusCheck?: string;
}

export interface LaunchSessionOptions {
  resourceProfile?: string;
  preferredShell?: string;
  reconnect?: boolean;
  ttlMinutes?: number;
}

const initialState: CodeServerStoreState = {
  initialized: false,
  resourceProfiles: ['small', 'medium', 'large'],
  defaultResourceProfile: 'medium',
  sessionTtlMinutes: 30,
  status: 'idle',
};

export const codeServerStore = map<CodeServerStoreState>(initialState);

let statusPollTimer: number | undefined;

function setStatus(status: CodeServerUiStatus, error?: string) {
  const current = codeServerStore.get();
  codeServerStore.set({
    ...current,
    status,
    error,
  });
}

function setSession(session?: CodeServerSession) {
  const current = codeServerStore.get();
  codeServerStore.set({
    ...current,
    session,
    lastStatusCheck: new Date().toISOString(),
    status: session ? (session.status === 'running' ? 'ready' : 'starting') : 'idle',
  });
}

export function initializeCodeServerStore(config: {
  userId: string;
  workspaceId: string;
  resourceProfiles: string[];
  defaultResourceProfile: string;
  sessionTtlMinutes: number;
}) {
  const current = codeServerStore.get();

  if (current.initialized) {
    return;
  }

  codeServerStore.set({
    ...current,
    initialized: true,
    userId: config.userId,
    workspaceId: config.workspaceId,
    resourceProfiles: config.resourceProfiles,
    defaultResourceProfile: config.defaultResourceProfile,
    sessionTtlMinutes: config.sessionTtlMinutes,
  });
}

function ensureInitialized() {
  const state = codeServerStore.get();

  if (!state.initialized || !state.userId || !state.workspaceId) {
    throw new Error('Code server store is not initialized');
  }

  return state;
}

function startStatusPolling(sessionId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  if (statusPollTimer) {
    window.clearInterval(statusPollTimer);
  }

  statusPollTimer = window.setInterval(() => {
    refreshCodeServerStatus(sessionId).catch((error) => {
      console.error('Failed to refresh code-server status', error);
    });
  }, 15_000);
}

function stopStatusPolling() {
  if (typeof window === 'undefined') {
    return;
  }

  if (statusPollTimer) {
    window.clearInterval(statusPollTimer);
    statusPollTimer = undefined;
  }
}

function buildLaunchPayload(options: LaunchSessionOptions) {
  const state = ensureInitialized();

  return {
    workspace_id: state.workspaceId,
    user_id: state.userId,
    resource_profile: options.resourceProfile || state.defaultResourceProfile,
    preferred_shell: options.preferredShell || 'bash',
    reconnect: options.reconnect !== false,
    ttl_minutes: options.ttlMinutes || state.sessionTtlMinutes,
  } satisfies Record<string, unknown>;
}

export async function launchCodeServerSession(options: LaunchSessionOptions = {}) {
  const state = ensureInitialized();

  setStatus('starting');

  try {
    const response = await fetch('/api/launch-code-server', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildLaunchPayload(options)),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Failed to launch code-server');
    }

    const data = (await response.json()) as { session: CodeServerSession };

    setSession(data.session);

    if (data.session) {
      startStatusPolling(data.session.sessionId);
    }
  } catch (error) {
    console.error('launchCodeServerSession failed', error);
    setStatus('error', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

export async function refreshCodeServerStatus(sessionId?: string) {
  const state = ensureInitialized();
  const activeSessionId = sessionId ?? state.session?.sessionId;

  if (!activeSessionId) {
    return;
  }

  try {
    const response = await fetch(`/api/code-server-status?session_id=${encodeURIComponent(activeSessionId)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        stopStatusPolling();
        setSession(undefined);
        return;
      }

      const text = await response.text();
      throw new Error(text || 'Failed to fetch status');
    }

    const data = (await response.json()) as { session: CodeServerSession };
    setSession(data.session);
  } catch (error) {
    console.error('refreshCodeServerStatus failed', error);
    setStatus('error', error instanceof Error ? error.message : 'Unknown error');
  }
}

export async function stopCodeServerSession() {
  const state = ensureInitialized();
  const sessionId = state.session?.sessionId;

  if (!sessionId) {
    return;
  }

  setStatus('stopping');

  try {
    const response = await fetch('/api/stop-code-server', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        user_id: state.userId,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Failed to stop code-server');
    }

    stopStatusPolling();
    setSession(undefined);
  } catch (error) {
    console.error('stopCodeServerSession failed', error);
    setStatus('error', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

export function setCodeServerConnected() {
  const current = codeServerStore.get();

  if (!current.session) {
    return;
  }

  codeServerStore.set({
    ...current,
    status: 'connected',
  });
}

