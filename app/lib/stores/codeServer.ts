import { atom, type WritableAtom } from 'nanostores';
import type { CodeServerConfig, CodeServerSession } from '~/types/codeServer';

const DEFAULT_CONFIG: CodeServerConfig = {
  available: false,
  defaultResourceProfile: 'medium',
  resourceProfiles: ['small', 'medium', 'large'],
  defaultTtlMinutes: 30,
  preferredShells: ['bash', 'zsh'],
  statusPollIntervalMs: 5000,
};

export const codeServerConfigStore: WritableAtom<CodeServerConfig> = atom<CodeServerConfig>(DEFAULT_CONFIG);

export const activeCodeServerSessionStore: WritableAtom<CodeServerSession | null> = atom<CodeServerSession | null>(null);

export function hydrateCodeServerConfig(config: Partial<CodeServerConfig>) {
  const current = codeServerConfigStore.get();
  codeServerConfigStore.set({
    ...current,
    ...config,
    resourceProfiles: config.resourceProfiles ?? current.resourceProfiles,
    preferredShells: config.preferredShells ?? current.preferredShells,
  });
}

export function setActiveCodeServerSession(session: CodeServerSession | null) {
  activeCodeServerSessionStore.set(session);
}
