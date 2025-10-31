import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { useLoaderData } from '@remix-run/react';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { ensureUserSession } from '~/lib/.server/auth/user-session';
import { parseAllowedResourceProfiles } from '~/utils/codeServerConfig';
import { CodeServerProvider } from '~/lib/contexts/CodeServerContext';

export const meta: MetaFunction = () => {
  return [{ title: 'Bolt' }, { name: 'description', content: 'Talk with Bolt, an AI assistant from StackBlitz' }];
};

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare?.env;

  if (!env) {
    throw new Error('Cloudflare environment is not available');
  }

  const workspaceId = env.BOLT_WORKSPACE_ID || 'default-workspace';
  const { session, setCookie } = await ensureUserSession(env, request, workspaceId);

  const resourceProfiles = parseAllowedResourceProfiles(env.CODE_SERVER_ALLOWED_RESOURCE_PROFILES);
  const defaultResourceProfile = env.CODE_SERVER_DEFAULT_RESOURCE_PROFILE || resourceProfiles[0] || 'medium';
  const ttlMinutes = Number(env.CODE_SERVER_SESSION_TTL_MINUTES || '30');

  const responseInit: ResponseInit = {};

  if (setCookie) {
    responseInit.headers = {
      'Set-Cookie': setCookie,
    };
  }

  return json(
    {
      user: {
        id: session.userId,
      },
      workspace: {
        id: workspaceId,
      },
      codeServer: {
        resourceProfiles,
        defaultResourceProfile,
        sessionTtlMinutes: ttlMinutes,
      },
    },
    responseInit,
  );
};

/**
 * Landing page component for Bolt
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  const loaderData = useLoaderData<typeof loader>();

  return (
    <CodeServerProvider value={loaderData}>
      <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
        <BackgroundRays />
        <Header />
        <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
      </div>
    </CodeServerProvider>
  );
}
