type AuditEventType = 'start' | 'stop' | 'status';

interface AuditEvent {
  type: AuditEventType;
  sessionId: string;
  workspaceId: string;
  userId: string;
  timestamp: string;
  status?: string;
  details?: Record<string, unknown>;
}

export async function recordAuditEvent(env: Env, event: AuditEvent) {
  if (!env.CODE_SERVER_AUDIT_LOG) {
    return;
  }

  const key = `audit:${event.sessionId}:${Date.now()}`;

  try {
    await env.CODE_SERVER_AUDIT_LOG.put(key, JSON.stringify(event), {
      expirationTtl: 60 * 60 * 24 * 7,
    });
  } catch (error) {
    console.warn('[code-server/audit] Failed to write audit event', error);
  }
}

