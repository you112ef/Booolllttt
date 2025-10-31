import Docker, { type Container } from 'dockerode';
import { randomUUID } from 'crypto';
import { access, constants, mkdir } from 'fs/promises';
import path from 'path';
import type { ControllerConfig, ResourceProfileConfig } from './config';

const docker = new Docker();

export interface ProvisionOptions {
  sessionId: string;
  workspaceId: string;
  resourceProfile: ResourceProfileConfig;
  preferredShell: string;
}

export interface ProvisionResult {
  container: Container;
  hostPort: number;
  password: string;
}

export async function ensureDirectory(dir: string) {
  try {
    await access(dir, constants.F_OK);
  } catch (error) {
    await mkdir(dir, { recursive: true });
  }
}

function parseMemory(value: string): number {
  const match = value.trim().match(/^(\d+)([kKmMgG])?$/);

  if (!match) {
    return 512 * 1024 * 1024;
  }

  const number = Number(match[1]);
  const unit = match[2]?.toLowerCase();

  switch (unit) {
    case 'k':
      return number * 1024;
    case 'm':
      return number * 1024 * 1024;
    case 'g':
      return number * 1024 * 1024 * 1024;
    default:
      return number;
  }
}

function cpuToNanoCpus(cpu: number): number {
  return Math.floor(cpu * 1_000_000_000);
}

async function waitForHealth(port: number, attempts = 30, intervalMs = 2000) {
  const url = `http://127.0.0.1:${port}/healthz`;

  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch (error) {
      // ignore and retry
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Timed out waiting for code-server health check');
}

async function inspectContainer(container: Container) {
  try {
    return await container.inspect();
  } catch (error) {
    return null;
  }
}

export async function provisionContainer(config: ControllerConfig, options: ProvisionOptions): Promise<ProvisionResult> {
  const containerName = `code-server-${options.sessionId}`;
  const workspacePath = path.join(config.workspaceRoot, options.workspaceId);
  const dataPath = path.join(config.dataRoot, options.sessionId);

  await ensureDirectory(workspacePath);
  await ensureDirectory(dataPath);

  const password = randomUUID();
  const resource = options.resourceProfile;

  const existing = docker.getContainer(containerName);
  const inspected = await inspectContainer(existing);

  if (inspected && inspected.State.Running) {
    const portInfo = inspected.NetworkSettings.Ports['8080/tcp']?.[0];

    if (!portInfo) {
      throw new Error('Running container missing port bindings');
    }

    return {
      container: existing,
      hostPort: Number(portInfo.HostPort),
      password,
    };
  }

  const container = await docker.createContainer({
    name: containerName,
    Image: config.codeServerImage,
    Env: [
      `PASSWORD=${password}`,
      'CODE_SERVER_AUTH=none',
      'WORKDIR=/workspace',
      `SESSION_ID=${options.sessionId}`,
      `WORKSPACE_ID=${options.workspaceId}`,
      `PREFERRED_SHELL=${options.preferredShell}`,
    ],
    ExposedPorts: {
      '8080/tcp': {},
    },
    HostConfig: {
      Binds: [
        `${workspacePath}:/workspace:rw`,
        `${dataPath}:/home/coder/.local/share/code-server:rw`,
      ],
      PortBindings: {
        '8080/tcp': [{ HostPort: '0' }],
      },
      NanoCpus: cpuToNanoCpus(resource.cpu),
      Memory: parseMemory(resource.memory),
      AutoRemove: true,
      RestartPolicy: {
        Name: 'no',
      },
    },
    Healthcheck: {
      Test: ['CMD', 'curl', '-f', 'http://localhost:8080/healthz'],
      Interval: 5_000_000_000,
      Timeout: 5_000_000_000,
      Retries: 3,
    },
  });

  await container.start();

  const newInspect = await container.inspect();
  const portInfo = newInspect.NetworkSettings.Ports['8080/tcp']?.[0];

  if (!portInfo) {
    throw new Error('Container did not expose port 8080');
  }

  const hostPort = Number(portInfo.HostPort);
  await waitForHealth(hostPort);

  return {
    container,
    hostPort,
    password,
  };
}

export async function stopAndRemoveContainer(sessionId: string) {
  const containerName = `code-server-${sessionId}`;
  const container = docker.getContainer(containerName);

  try {
    await container.stop({ t: 10 });
  } catch (error) {
    // ignore if already stopped
  }

  try {
    await container.remove({ force: true });
  } catch (error) {
    // ignore if already removed
  }
}

