import type { FastifyInstance } from 'fastify';
import type { CacheProvider } from '../../domain/services/queue.interface.js';

export function registerHealthRoutes(app: FastifyInstance, cache: CacheProvider): void {
  app.get('/health', async (_req, reply) => {
    const cacheOk = await cache.ping();
    return reply.status(cacheOk ? 200 : 503).send({
      status: cacheOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: { cache: cacheOk ? 'up' : 'down' },
    });
  });

  app.get('/ready', async (_req, reply) => {
    return reply.send({ ready: true });
  });
}

export function registerMetricsRoutes(app: FastifyInstance): void {
  app.get('/metrics', async (_req, reply) => {
    const prom = await import('prom-client');
    reply.header('Content-Type', prom.register.contentType);
    return prom.register.metrics();
  });
}
