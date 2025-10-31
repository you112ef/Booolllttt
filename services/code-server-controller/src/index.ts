import Fastify from 'fastify';
import { z } from 'zod';
import httpProxy from 'http-proxy';
import { loadConfig } from './config.js';
import { SessionManager } from './sessionManager.js';
import { verifyToken } from './token.js';

const config = loadConfig();
const sessionManager = new SessionManager(config);
const fastify = Fastify({ logger: true });
const proxy = httpProxy.createProxyServer({ ws: true });

const createSessionSchema = z.object({
  sessionId: z.string(),
  workspaceId: z.string(),
  userId: z.string(),
  resourceProfile: z.string().default('small'),
  preferredShell: z.string().default('bash'),
  ttlMinutes: z.number().int().min(5).max(240).default(config.defaultTtlMinutes),
});

function ensureControllerAuth(authorization?: string) {
  if (!config.apiToken) {
    return;
  }

  if (!authorization) {
    const error = new Error('Missing controller API token');
    (error as any).statusCode = 401;
    throw error;
  }

  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || token !== config.apiToken) {
    const error = new Error('Invalid controller API token');
    (error as any).statusCode = 401;
    throw error;
  }
}

fastify.get('/healthz', async () => ({ status: 'ok' }));

fastify.post('/api/v1/code-server/sessions', async (request, reply) => {
  ensureControllerAuth(request.headers.authorization);

  const parsed = createSessionSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  const session = await sessionManager.createOrReuseSession(parsed.data);

  return reply.send({
    sessionId: session.sessionId,
    status: session.status,
    containerId: session.containerId,
    httpUrl: session.httpUrl,
    wsUrl: session.wsUrl,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    resourceProfile: session.resourceProfile,
    preferredShell: session.preferredShell,
  });
});

fastify.get('/api/v1/code-server/sessions/:sessionId', async (request, reply) => {
  ensureControllerAuth(request.headers.authorization);

  const sessionId = (request.params as any).sessionId as string;
  const session = sessionManager.get(sessionId);

  if (!session) {
    return reply.status(404).send({ error: 'Not found' });
  }

  return reply.send({
    sessionId: session.sessionId,
    status: session.status,
    containerId: session.containerId,
    httpUrl: session.httpUrl,
    wsUrl: session.wsUrl,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    resourceProfile: session.resourceProfile,
    preferredShell: session.preferredShell,
  });
});

fastify.post('/api/v1/code-server/sessions/:sessionId/stop', async (request, reply) => {
  ensureControllerAuth(request.headers.authorization);

  const sessionId = (request.params as any).sessionId as string;
  await sessionManager.stop(sessionId);

  return reply.send({ sessionId, status: 'stopped', stoppedAt: new Date().toISOString() });
});

fastify.all('/proxy/:sessionId/*', async (request, reply) => {
  const token = request.headers.authorization?.split(' ')[1];

  if (!token) {
    reply.code(401).send({ error: 'Missing Authorization header' });
    return;
  }

  const payload = await verifyToken(config.jwtPublicKey, token);

  if (!payload) {
    reply.code(401).send({ error: 'Invalid token' });
    return;
  }

  const sessionId = (request.params as any).sessionId as string;
  const session = sessionManager.get(sessionId);

  if (!session || payload.sessionId !== session.sessionId) {
    reply.code(403).send({ error: 'Forbidden' });
    return;
  }

  const target = `http://127.0.0.1:${session.hostPort}`;

  reply.hijack();
  proxy.web(request.raw, reply.raw, { target }, (error) => {
    if (error) {
      fastify.log.error(error);
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(502, { 'Content-Type': 'application/json' });
      }
      reply.raw.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
    }
  });
});

fastify.server.on('upgrade', async (request, socket, head) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const match = url.pathname.match(/^\/proxy\/(.+?)(\/.*)?$/);

    if (!match) {
      socket.destroy();
      return;
    }

    const sessionId = match[1];
    const token = request.headers['authorization']?.split(' ')[1];

    if (!token) {
      socket.destroy();
      return;
    }

    const payload = await verifyToken(config.jwtPublicKey, token);
    const session = payload ? sessionManager.get(sessionId) : undefined;

    if (!payload || !session || payload.sessionId !== session.sessionId) {
      socket.destroy();
      return;
    }

    const target = `http://127.0.0.1:${session.hostPort}`;

    proxy.ws(request, socket, head, { target }, (error) => {
      if (error) {
        fastify.log.error(error);
        socket.destroy();
      }
    });
  } catch (error) {
    fastify.log.error(error);
    socket.destroy();
  }
});

async function start() {
  try {
    await fastify.listen({ port: config.port, host: config.host.split(':')[0] });
    fastify.log.info(`code-server controller listening on ${config.host}`);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

start();

