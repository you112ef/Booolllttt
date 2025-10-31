import type {
  ControllerLaunchResponse,
  ControllerStatusResponse,
  ControllerStopResponse,
  LaunchCodeServerInput,
  ResourceProfile,
} from './types';

const API_PREFIX = '/api/v1/code-server';

function controllerUrl(env: Env) {
  const base = env.CODE_SERVER_CONTROLLER_URL;

  if (!base) {
    throw new Error('CODE_SERVER_CONTROLLER_URL is not configured');
  }

  return base.replace(/\/$/, '');
}

function authHeaders(env: Env): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (env.CODE_SERVER_CONTROLLER_TOKEN) {
    headers['Authorization'] = `Bearer ${env.CODE_SERVER_CONTROLLER_TOKEN}`;
  }

  return headers;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Controller request failed (${response.status}): ${message}`);
  }

  return (await response.json()) as T;
}

export async function requestLaunch(
  env: Env,
  sessionId: string,
  input: LaunchCodeServerInput & { resourceProfile: ResourceProfile; ttlMinutes: number },
): Promise<ControllerLaunchResponse> {
  const response = await fetch(`${controllerUrl(env)}${API_PREFIX}/sessions`, {
    method: 'POST',
    headers: authHeaders(env),
    body: JSON.stringify({
      sessionId,
      workspaceId: input.workspaceId,
      resourceProfile: input.resourceProfile,
      preferredShell: input.preferredShell,
      ttlMinutes: input.ttlMinutes,
      userId: input.userId,
    }),
  });

  return parseResponse<ControllerLaunchResponse>(response);
}

export async function requestStatus(env: Env, sessionId: string): Promise<ControllerStatusResponse> {
  const response = await fetch(`${controllerUrl(env)}${API_PREFIX}/sessions/${sessionId}`, {
    method: 'GET',
    headers: authHeaders(env),
  });

  return parseResponse<ControllerStatusResponse>(response);
}

export async function requestStop(env: Env, sessionId: string): Promise<ControllerStopResponse> {
  const response = await fetch(`${controllerUrl(env)}${API_PREFIX}/sessions/${sessionId}/stop`, {
    method: 'POST',
    headers: authHeaders(env),
  });

  return parseResponse<ControllerStopResponse>(response);
}

