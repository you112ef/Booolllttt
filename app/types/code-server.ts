export type CodeServerStatus = 'starting' | 'running' | 'stopped' | 'failed';

export interface CodeServerSession {
  sessionId: string;
  workspaceId: string;
  userId: string;
  status: CodeServerStatus;
  resourceProfile: string;
  preferredShell: string;
  sessionUrl: string;
  wsTunnelUrl: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  controller: {
    sessionId: string;
    containerId: string;
    httpUrl: string;
    wsUrl: string;
    startedAt: string;
    expiresAt: string;
    status: CodeServerStatus;
    logsPath?: string;
    metricsEndpoint?: string;
    healthEndpoint?: string;
  };
}

export interface CodeServerLaunchResponse {
  session: CodeServerSession;
}

