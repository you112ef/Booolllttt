import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button } from '~/components/ui/Button';
import { codeServerStore, launchCodeServerSession, setCodeServerConnected, stopCodeServerSession } from '~/lib/stores/codeServer';
import type { CodeServerSession } from '~/types/code-server';
import { classNames } from '~/utils/classNames';
import { useCodeServerContext } from '~/lib/contexts/CodeServerContext';

interface CodeServerLauncherProps {
  className?: string;
}

const STATUS_LABELS: Record<string, string> = {
  idle: 'Idle',
  starting: 'Starting...',
  ready: 'Ready',
  connected: 'Connected',
  stopping: 'Stopping...',
  error: 'Error',
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const color =
    status === 'connected'
      ? 'bg-emerald-500'
      : status === 'ready'
        ? 'bg-blue-500'
        : status === 'error'
          ? 'bg-red-500'
          : 'bg-amber-500';

  return (
    <span className={classNames('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white', color)}>
      {status === 'starting' && <div className="i-ph:circle-notch-bold animate-spin" />}
      {label}
    </span>
  );
}

function SessionDetails({ session }: { session: CodeServerSession }) {
  const startedAt = new Date(session.createdAt).toLocaleTimeString();
  const expiresAt = new Date(session.expiresAt).toLocaleTimeString();

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-bolt-elements-textTertiary">
      <div>
        <dt className="font-medium text-bolt-elements-textSecondary">Resource</dt>
        <dd>{session.resourceProfile}</dd>
      </div>
      <div>
        <dt className="font-medium text-bolt-elements-textSecondary">Shell</dt>
        <dd>{session.preferredShell}</dd>
      </div>
      <div>
        <dt className="font-medium text-bolt-elements-textSecondary">Started</dt>
        <dd>{startedAt}</dd>
      </div>
      <div>
        <dt className="font-medium text-bolt-elements-textSecondary">Expires</dt>
        <dd>{expiresAt}</dd>
      </div>
    </dl>
  );
}

export function CodeServerLauncher({ className }: CodeServerLauncherProps) {
  const { codeServer } = useCodeServerContext();
  const store = useStore(codeServerStore);
  const [open, setOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string>(codeServer.defaultResourceProfile);
  const [preferredShell, setPreferredShell] = useState('bash');
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    setSelectedProfile(codeServer.defaultResourceProfile);
  }, [codeServer.defaultResourceProfile]);

  const handleOpen = async () => {
    setOpen(true);

    if (!store.session && !isLaunching) {
      setIsLaunching(true);

      try {
        await launchCodeServerSession({
          resourceProfile: selectedProfile,
          preferredShell,
        });
      } catch (error) {
        console.error('Failed to launch code-server', error);
      } finally {
        setIsLaunching(false);
      }
    }
  };

  const handleStop = async () => {
    try {
      await stopCodeServerSession();
    } catch (error) {
      console.error('Failed to stop code-server session', error);
    }
  };

  const frameId = useMemo(() => `code-server-frame-${store.session?.sessionId ?? 'pending'}`, [store.session?.sessionId]);

  return (
    <div className={classNames('relative flex items-center', className)}>
      <Button
        variant="outline"
        onClick={handleOpen}
        disabled={isLaunching || store.status === 'stopping'}
        className="flex items-center gap-2"
      >
        <div className="i-ph:browser-duotone" />
        <span>Open in Code Server</span>
        <StatusBadge status={store.status} />
      </Button>

      {open && (
        <div className="fixed inset-0 z-[10000] flex flex-col bg-black/70 backdrop-blur-sm">
          <div className="relative flex flex-col h-full w-full bg-bolt-elements-background-depth-2">
            <header className="flex items-center justify-between px-6 py-4 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1/90">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Cloud Code Server Session</h2>
                <StatusBadge status={store.status} />
              </div>
              <div className="flex items-center gap-2">
                {store.session ? (
                  <>
                    <a
                      href={store.session.sessionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                    >
                      <div className="i-ph:arrow-square-out" />
                      Open in new tab
                    </a>
                    <Button
                      variant="destructive"
                      onClick={handleStop}
                      disabled={store.status === 'stopping'}
                    >
                      Stop Session
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={async () => {
                      setIsLaunching(true);

                      try {
                        await launchCodeServerSession({
                          resourceProfile: selectedProfile,
                          preferredShell,
                        });
                      } catch (error) {
                        console.error('Failed to launch code-server', error);
                      } finally {
                        setIsLaunching(false);
                      }
                    }}
                    disabled={isLaunching}
                  >
                    {isLaunching ? 'Starting...' : 'Start Session'}
                  </Button>
                )}

                <button
                  type="button"
                  className="ml-2 inline-flex items-center justify-center rounded-full w-9 h-9 bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary border border-bolt-elements-borderColor"
                  onClick={() => setOpen(false)}
                >
                  <div className="i-ph:x-bold text-lg" />
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] flex-1 overflow-hidden">
              <aside className="border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 space-y-4">
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Launch settings</h3>
                  <label className="flex flex-col gap-1 text-xs text-bolt-elements-textSecondary">
                    Resource profile
                    <select
                      className="border border-bolt-elements-borderColor rounded-md px-2 py-1 bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary"
                      value={selectedProfile}
                      onChange={(event) => setSelectedProfile(event.target.value)}
                      disabled={!!store.session}
                    >
                      {store.resourceProfiles.map((profile) => (
                        <option key={profile} value={profile}>
                          {profile}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-bolt-elements-textSecondary">
                    Preferred shell
                    <select
                      className="border border-bolt-elements-borderColor rounded-md px-2 py-1 bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary"
                      value={preferredShell}
                      onChange={(event) => setPreferredShell(event.target.value)}
                      disabled={!!store.session}
                    >
                      {['bash', 'zsh', 'fish'].map((shell) => (
                        <option key={shell} value={shell}>
                          {shell}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>

                {store.session && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Session details</h3>
                    <SessionDetails session={store.session} />
                  </section>
                )}

                {store.error && (
                  <p className="text-xs text-red-500">{store.error}</p>
                )}
              </aside>

              <main className="relative bg-bolt-elements-background-depth-2">
                {!store.session && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-bolt-elements-textSecondary">
                    <div className="i-ph:cloud-arrow-up-duotone text-4xl" />
                    <p className="text-sm">Session will appear here once started</p>
                    <StatusBadge status={store.status} />
                  </div>
                )}

                {store.session && (
                  <iframe
                    id={frameId}
                    src={store.session.sessionUrl}
                    title="Cloud Code Server"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-pointer-lock allow-popups allow-downloads"
                    allow="clipboard-write; fullscreen"
                    className="w-full h-full border-0"
                    onLoad={() => setCodeServerConnected()}
                  />
                )}
              </main>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

