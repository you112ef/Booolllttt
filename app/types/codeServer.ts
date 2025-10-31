export type CodeServerResourceProfile = 'small' | 'medium' | 'large';

export type CodeServerStatus = 'starting' | 'running' | 'stopped' | 'failed';

export type CodeServerPreferredShell = 'bash' | 'zsh' | 'fish' | 'sh';

export interface CodeServerSession {
  sessionId: string;
  sessionUrl: string;
  wsTunnel?: string;
  token?: string;
  expiresAt: string;
  status: CodeServerStatus;
  workspaceId: string;
  userId: string;
}

export interface CodeServerSessionRequest {
  workspaceId: string;
  userId: string;
  resourceProfile: CodeServerResourceProfile;
  preferredShell?: CodeServerPreferredShell;
  ttlMinutes?: number;
}

export interface CodeServerConfig {
  available: boolean;
  defaultResourceProfile: CodeServerResourceProfile;
  resourceProfiles: CodeServerResourceProfile[];
  defaultTtlMinutes: number;
  preferredShells: CodeServerPreferredShell[];
  statusPollIntervalMs: number;
}

export interface StoredCodeServerSession extends CodeServerSession {
  createdAt: string;
  updatedAt: string;
}
