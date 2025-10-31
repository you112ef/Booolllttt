import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  activeCodeServerSessionStore,
  codeServerConfigStore,
  setActiveCodeServerSession,
} from '~/lib/stores/codeServer';
import type { CodeServerSession, CodeServerSessionRequest, CodeServerStatus } from '~/types/codeServer';

type SessionPhase = 'idle' | 'launching' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

function resolveAuthToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  const globalToken = (window as typeof window & { __boltAuthToken?: string }).__boltAuthToken;
  if (globalToken) {
    return globalToken;
  }

  return localStorage.getItem('boltAuthToken');
}

function buildHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = resolveAuthToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

interface UseCodeServerSessionOptions {
  workspaceId?: string;
  userId?: string;
}

export function useCodeServerSession(initialOptions: UseCodeServerSessionOptions = {}) {
  const config = useStore(codeServerConfigStore);
  const activeSession = useStore(activeCodeServerSessionStore);
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const statusPollRef = useRef<number | undefined>(undefined);

  const workspaceId = initialOptions.workspaceId;
  const userId = initialOptions.userId;

  const isConnected = useMemo(() => activeSession?.status === 'running', [activeSession]);

  const clearStatusPoll = useCallback(() => {
    if (statusPollRef.current) {
      window.clearInterval(statusPollRef.current);
      statusPollRef.current = undefined;
    }
  }, []);

  const scheduleStatusPoll = useCallback(
    (sessionId: string) => {
      clearStatusPoll();

      statusPollRef.current = window.setInterval(async () => {
        try {
          const response = await fetch(`/api/code-server-status?session_id=${encodeURIComponent(sessionId)}`, {
            method: 'GET',
            headers: buildHeaders(),
          });

          if (!response.ok) {
            if (response.status === 401) {
              throw new Error('Authentication required');
            }

            throw new Error(`Status check failed (${response.status})`);
          }

          const data = (await response.json()) as {
            status: CodeServerStatus;
            session_url?: string;
            token?: string;
            ws_tunnel?: string;
            expires_at?: string;
            workspace_id?: string;
            user_id?: string;
          };

          if (!data) {
            return;
          }

          if (data.status === 'failed') {
            setPhase('error');
            setError('code-server session failed to start');
            clearStatusPoll();
            return;
          }

          if (data.status === 'stopped') {
            setPhase('stopped');
            setActiveCodeServerSession(null);
            clearStatusPoll();
            return;
          }

          if (data.status === 'running') {
            setPhase('running');
          } else {
            setPhase('starting');
          }

          if (data.session_url) {
            const updatedSession: CodeServerSession = {
              sessionId,
              sessionUrl: data.session_url,
              wsTunnel: data.ws_tunnel,
              token: data.token,
              expiresAt: data.expires_at ?? activeSession?.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              status: data.status,
              workspaceId: data.workspace_id ?? workspaceId ?? '',
              userId: data.user_id ?? userId ?? '',
            };

            setActiveCodeServerSession(updatedSession);
          }
        } catch (statusError) {
          clearStatusPoll();
          setPhase('error');
          setError(statusError instanceof Error ? statusError.message : String(statusError));
        }
      }, Math.max(2000, config.statusPollIntervalMs));
    },
    [activeSession?.expiresAt, clearStatusPoll, config.statusPollIntervalMs, userId, workspaceId],
  );

  const launch = useCallback(
    async (overrides: Partial<CodeServerSessionRequest> = {}) => {
      const resolvedWorkspaceId = overrides.workspaceId ?? workspaceId;
      const resolvedUserId = overrides.userId ?? userId;

      if (!resolvedWorkspaceId || !resolvedUserId) {
        throw new Error('workspaceId and userId are required to launch code-server');
      }

      setPhase('launching');
      setError(null);

      const response = await fetch('/api/launch-code-server', {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          workspace_id: resolvedWorkspaceId,
          user_id: resolvedUserId,
          resource_profile: overrides.resourceProfile ?? config.defaultResourceProfile,
          preferred_shell: overrides.preferredShell,
          ttl_minutes: overrides.ttlMinutes ?? config.defaultTtlMinutes,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => undefined);
        const message = errorBody?.error ?? `Failed to launch session (${response.status})`;
        setPhase('error');
        setError(message);
        throw new Error(message);
      }

      const session = (await response.json()) as CodeServerSession;

      setActiveCodeServerSession(session);
      setPhase(session.status === 'running' ? 'running' : 'starting');
      scheduleStatusPoll(session.sessionId);

      return session;
    },
    [config.defaultResourceProfile, config.defaultTtlMinutes, scheduleStatusPoll, userId, workspaceId],
  );

  const stop = useCallback(
    async (sessionId?: string) => {
      const targetSessionId = sessionId ?? activeSession?.sessionId;

      if (!targetSessionId) {
        return;
      }

      setPhase('stopping');
      setError(null);

      const response = await fetch('/api/stop-code-server', {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ session_id: targetSessionId, user_id: userId ?? activeSession?.userId }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => undefined);
        const message = errorBody?.error ?? `Failed to stop session (${response.status})`;
        setPhase('error');
        setError(message);
        throw new Error(message);
      }

      clearStatusPoll();
      setActiveCodeServerSession(null);
      setPhase('stopped');
    },
    [activeSession, clearStatusPoll, userId],
  );

  const reset = useCallback(() => {
    clearStatusPoll();
    setActiveCodeServerSession(null);
    setPhase('idle');
    setError(null);
  }, [clearStatusPoll]);

  useEffect(() => {
    if (activeSession && (phase === 'starting' || phase === 'running')) {
      scheduleStatusPoll(activeSession.sessionId);
    }

    return () => {
      clearStatusPoll();
    };
  }, [activeSession, clearStatusPoll, phase, scheduleStatusPoll]);

  useEffect(() => {
    if (activeSession) {
      setPhase(activeSession.status === 'running' ? 'running' : activeSession.status === 'starting' ? 'starting' : 'idle');
    } else if (phase !== 'idle') {
      setPhase('idle');
    }
  }, [activeSession, phase]);

  return {
    config,
    session: activeSession,
    phase,
    isConnected,
    error,
    launch,
    stop,
    reset,
  };
}
