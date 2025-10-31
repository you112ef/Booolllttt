import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { parseCookies } from '~/lib/api/cookies';
import { getSession } from '~/lib/.server/code-server/session-store';
import { verifySessionToken } from '~/lib/.server/code-server/jwt';

type HandlerArgs = LoaderFunctionArgs | ActionFunctionArgs;

async function handleRequest({ request, context, params }: HandlerArgs) {
  const env = context.cloudflare?.env;

  if (!env) {
    throw new Error('Cloudflare environment is not available');
  }

  const sessionId = params.sessionId;

  if (!sessionId) {
    return new Response('Session ID missing', { status: 400 });
  }

  const cookies = parseCookies(request.headers.get('Cookie'));
  const token = cookies[`bolt_code_session_${sessionId}`];

  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await verifySessionToken(env, token);

  if (!payload || payload.sessionId !== sessionId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const storedSession = await getSession(env, sessionId);

  if (!storedSession) {
    return new Response('Not Found', { status: 404 });
  }

  const baseUrl = storedSession.controller.httpUrl.replace(/\/$/, '');
  const wsBaseUrl = storedSession.controller.wsUrl.replace(/\/$/, '');
  const requestedPath = params['*'] ? `/${params['*']}` : '';
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`${requestedPath}${incomingUrl.search}`, baseUrl).toString();
  const targetWsUrl = new URL(`${requestedPath}${incomingUrl.search}`, wsBaseUrl).toString();

  const isWebSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

  const headers = new Headers();

  for (const [key, value] of request.headers.entries()) {
    if (['host', 'cookie', 'cf-connecting-ip', 'cdn-loop'].includes(key.toLowerCase())) {
      continue;
    }

    headers.set(key, value);
  }

  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-Bolt-Session-Id', sessionId);
  headers.set('X-Bolt-Workspace-Id', storedSession.workspaceId);

  if (request.headers.has('CF-Connecting-IP')) {
    headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP')!);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = request.body;
    (init as any).duplex = 'half';
  }

  const urlToFetch = isWebSocket ? targetWsUrl : targetUrl;
  const response = await fetch(urlToFetch, init);
  const proxiedHeaders = new Headers();

  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === 'set-cookie') {
      continue;
    }

    proxiedHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxiedHeaders,
  });
}

export async function loader(args: LoaderFunctionArgs) {
  return handleRequest(args);
}

export async function action(args: ActionFunctionArgs) {
  return handleRequest(args);
}

