import { createContext, useContext, useEffect } from 'react';
import { initializeCodeServerStore } from '~/lib/stores/codeServer';

export interface CodeServerContextValue {
  user: {
    id: string;
  };
  workspace: {
    id: string;
  };
  codeServer: {
    resourceProfiles: string[];
    defaultResourceProfile: string;
    sessionTtlMinutes: number;
  };
}

const CodeServerContext = createContext<CodeServerContextValue | undefined>(undefined);

interface ProviderProps {
  value: CodeServerContextValue;
  children: React.ReactNode;
}

export function CodeServerProvider({ value, children }: ProviderProps) {
  useEffect(() => {
    initializeCodeServerStore({
      userId: value.user.id,
      workspaceId: value.workspace.id,
      resourceProfiles: value.codeServer.resourceProfiles,
      defaultResourceProfile: value.codeServer.defaultResourceProfile,
      sessionTtlMinutes: value.codeServer.sessionTtlMinutes,
    });
  }, [value]);

  return <CodeServerContext.Provider value={value}>{children}</CodeServerContext.Provider>;
}

export function useCodeServerContext(): CodeServerContextValue {
  const ctx = useContext(CodeServerContext);

  if (!ctx) {
    throw new Error('useCodeServerContext must be used within a CodeServerProvider');
  }

  return ctx;
}

