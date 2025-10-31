export type CodeServerStatus = 'starting' | 'running' | 'stopped' | 'failed';

export type ResourceProfile = 'small' | 'medium' | 'large' | string;

export interface LaunchCodeServerInput {
  workspaceId: string;
  userId: string;
  resourceProfile?: ResourceProfile;
  preferredShell?: 'bash' | 'zsh' | 'fish' | string;
  ttlMinutes?: number;
  reconnect?: boolean;
}

export interface CodeServerSession {
  sessionId: string;
  workspaceId: string;
  userId: string;
  status: CodeServerStatus;
  resourceProfile: ResourceProfile;
  preferredShell: string;
  sessionUrl: string;
  wsTunnelUrl: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  controller: ControllerSession;
}

export interface ControllerSession {
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
}

export interface StoredCodeServerSession extends CodeServerSession {
  tokenId: string;
  tokenIssuedAt: string;
}

export interface ControllerLaunchResponse {
  sessionId: string;
  status: CodeServerStatus;
  httpUrl: string;
  wsUrl: string;
  containerId: string;
  startedAt: string;
  expiresAt: string;
  resourceProfile: ResourceProfile;
  preferredShell: string;
  logsPath?: string;
  metricsEndpoint?: string;
  healthEndpoint?: string;
}

export interface ControllerStatusResponse {
  sessionId: string;
  status: CodeServerStatus;
  containerId: string;
  httpUrl: string;
  wsUrl: string;
  startedAt: string;
  expiresAt: string;
  logsPath?: string;
  metricsEndpoint?: string;
  healthEndpoint?: string;
}

export interface ControllerStopResponse {
  sessionId: string;
  status: 'stopped';
  stoppedAt: string;
}

export interface SessionTokenPayload {
  sessionId: string;
  workspaceId: string;
  userId: string;
  scope: string[];
}

