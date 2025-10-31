import { useCallback, useEffect, useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { createPortal } from 'react-dom';
import { classNames } from '~/utils/classNames';
import { useCodeServerSession } from '~/lib/hooks/useCodeServerSession';
import type { CodeServerResourceProfile, CodeServerSessionRequest } from '~/types/codeServer';

interface CodeServerLauncherProps {
  workspaceId?: string;
  userId?: string;
}

export function CodeServerLauncher({ workspaceId, userId }: CodeServerLauncherProps) {
  const {
    config,
    session,
    phase,
    isConnected,
    error,
    launch,
    stop,
  } = useCodeServerSession({ workspaceId, userId });

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(workspaceId ?? '');
  const [currentUserId, setCurrentUserId] = useState(userId ?? '');
  const [resourceProfile, setResourceProfile] = useState<CodeServerResourceProfile>(config.defaultResourceProfile);
  const [preferredShell, setPreferredShell] = useState(config.preferredShells[0] ?? 'bash');
  const [ttlMinutes, setTtlMinutes] = useState(config.defaultTtlMinutes);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setCurrentWorkspaceId(workspaceId ?? '');
  }, [workspaceId]);

  useEffect(() => {
    setCurrentUserId(userId ?? '');
  }, [userId]);

  useEffect(() => {
    setResourceProfile(config.defaultResourceProfile);
    setPreferredShell(config.preferredShells[0] ?? 'bash');
    setTtlMinutes(config.defaultTtlMinutes);
  }, [config.defaultResourceProfile, config.defaultTtlMinutes, config.preferredShells]);

  useEffect(() => {
    if (!config.available) {
      setShowEmbed(false);
    }
  }, [config.available]);

  const statusColor = useMemo(() => {
    switch (phase) {
      case 'running':
        return 'bg-emerald-500';
      case 'starting':
      case 'launching':
        return 'bg-amber-400';
      case 'error':
        return 'bg-red-500';
      case 'stopping':
        return 'bg-blue-400';
      default:
        return 'bg-gray-400';
    }
  }, [phase]);

  const handleLaunch = useCallback(async () => {
    if (!config.available) {
      return;
    }

    setIsSubmitting(true);

    try {
      await launch({
        workspaceId: currentWorkspaceId,
        userId: currentUserId,
        resourceProfile,
        preferredShell,
        ttlMinutes,
      });
      setShowEmbed(true);
      setIsDropdownOpen(false);
    } catch (launchError) {
      console.error('Failed to launch code-server session', launchError);
    } finally {
      setIsSubmitting(false);
    }
  }, [config.available, currentUserId, currentWorkspaceId, launch, preferredShell, resourceProfile, ttlMinutes]);

  const handleStop = useCallback(async () => {
    if (!session) {
      return;
    }

    setIsSubmitting(true);
    try {
      await stop(session.sessionId);
      setShowEmbed(false);
    } catch (stopError) {
      console.error('Failed to stop code-server session', stopError);
    } finally {
      setIsSubmitting(false);
    }
  }, [session, stop]);

  const renderEmbed = () => {
    if (!showEmbed || !session?.sessionUrl || typeof document === 'undefined') {
      return null;
    }

    return createPortal(
      <div className="fixed inset-0 z-[999] pointer-events-none">
        <div className="absolute inset-0 bg-black/60" onClick={() => setShowEmbed(false)} />
        <div className="pointer-events-auto absolute inset-y-6 inset-x-6 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <header className="flex items-center justify-between px-4 py-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
            <div>
              <h2 className="text-base font-semibold text-bolt-elements-textPrimary">code-server Session</h2>
              {session.sessionUrl && (
                <p className="text-xs text-bolt-elements-textTertiary mt-1 truncate">
                  {session.sessionUrl}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <a
                href={session.sessionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
              >
                <span className="i-ph:arrow-square-out text-sm" />
                Open in New Tab
              </a>
              <button
                type="button"
                onClick={() => setShowEmbed(false)}
                className="inline-flex items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
              >
                <span className="i-ph:x text-base" />
              </button>
            </div>
          </header>
          <iframe
            title="code-server"
            src={session.sessionUrl}
            className="flex-1 w-full border-0"
            allow="clipboard-read; clipboard-write"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
          />
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <div className="relative">
      <DropdownMenu.Root open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenu.Trigger
          className={classNames(
            'inline-flex items-center gap-2 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium transition-colors',
            'bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary',
            !config.available && 'opacity-60 cursor-not-allowed',
          )}
          disabled={!config.available}
        >
          <span className={classNames('w-2 h-2 rounded-full', statusColor)} />
          Code Server
          <span className="i-ph:caret-down text-sm" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          className={classNames(
            'z-[200] mt-2 w-[320px] rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 shadow-xl',
            'animate-in fade-in-0 zoom-in-95',
          )}
          sideOffset={6}
          align="end"
        >
          {!config.available ? (
            <p className="text-sm text-bolt-elements-textTertiary">
              Configure `CODE_SERVER_PROVISIONER_URL` and authentication keys to enable code-server sessions.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-bolt-elements-textSecondary">Workspace ID</label>
                <input
                  value={currentWorkspaceId}
                  onChange={(event) => setCurrentWorkspaceId(event.target.value)}
                  placeholder="workspace-123"
                  className="mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 text-sm focus:border-accent-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-bolt-elements-textSecondary">User ID</label>
                <input
                  value={currentUserId}
                  onChange={(event) => setCurrentUserId(event.target.value)}
                  placeholder="user-uuid"
                  className="mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 text-sm focus:border-accent-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-bolt-elements-textSecondary">Profile</label>
                  <select
                    value={resourceProfile}
                    onChange={(event) => setResourceProfile(event.target.value as CodeServerResourceProfile)}
                    className="mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 text-sm focus:border-accent-500 focus:outline-none"
                  >
                    {config.resourceProfiles.map((profile) => (
                      <option key={profile} value={profile}>
                        {profile}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-bolt-elements-textSecondary">Shell</label>
                  <select
                    value={preferredShell}
                    onChange={(event) => setPreferredShell(event.target.value as CodeServerSessionRequest['preferredShell'])}
                    className="mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 text-sm focus:border-accent-500 focus:outline-none"
                  >
                    {config.preferredShells.map((shell) => (
                      <option key={shell} value={shell}>
                        {shell}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-bolt-elements-textSecondary">TTL (minutes)</label>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={ttlMinutes}
                  onChange={(event) => setTtlMinutes(Number.parseInt(event.target.value, 10) || config.defaultTtlMinutes)}
                  className="mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 text-sm focus:border-accent-500 focus:outline-none"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleLaunch}
                  disabled={isSubmitting || !currentWorkspaceId || !currentUserId}
                  className={classNames(
                    'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isSubmitting
                      ? 'bg-accent-500/60 text-white cursor-wait'
                      : 'bg-accent-500 text-white hover:bg-accent-600',
                    (!currentWorkspaceId || !currentUserId) && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  <span className="i-ph:play text-sm" />
                  {isSubmitting && phase !== 'stopping' ? 'Starting?' : 'Launch'}
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  disabled={!session || isSubmitting}
                  className={classNames(
                    'inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                    session
                      ? 'border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3'
                      : 'border-bolt-elements-borderColor text-bolt-elements-textTertiary cursor-not-allowed opacity-60',
                  )}
                >
                  <span className="i-ph:stop-circle text-sm" />
                  {isSubmitting && phase === 'stopping' ? 'Stopping?' : 'Stop'}
                </button>
                {session && (
                  <button
                    type="button"
                    onClick={() => setShowEmbed((current) => !current)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
                  >
                    <span className="i-ph:monitor text-sm" />
                    {showEmbed ? 'Hide Inline Session' : 'Open Inline'}
                  </button>
                )}
                {session && (
                  <a
                    href={session.sessionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
                  >
                    <span className="i-ph:arrow-square-out text-sm" />
                    Open in New Tab
                  </a>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-2 text-[11px] text-bolt-elements-textTertiary">
                <div>
                  <dt className="uppercase tracking-wide">Phase</dt>
                  <dd className="text-bolt-elements-textSecondary">{phase}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wide">Connected</dt>
                  <dd className="text-bolt-elements-textSecondary">{isConnected ? 'yes' : 'no'}</dd>
                </div>
                {session?.expiresAt && (
                  <div className="col-span-2">
                    <dt className="uppercase tracking-wide">Expires</dt>
                    <dd className="text-bolt-elements-textSecondary">{new Date(session.expiresAt).toLocaleString()}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      {renderEmbed()}
    </div>
  );
}
