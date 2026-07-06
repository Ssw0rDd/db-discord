import { injectable, inject } from 'tsyringe';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../../config/index.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import type { CacheProvider, IJobQueueService } from '../../domain/services/queue.interface.js';
import { ProjectRepository } from '../database/repositories/project.repository.js';
import { registerHealthRoutes } from './health.routes.js';
import { registerMetricsRoutes } from './metrics.routes.js';

@injectable()
export class WebhookServer {
  private app = Fastify({ logger: false });

  constructor(
    @inject(TOKENS.Config) private config: AppConfig,
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(TOKENS.Cache) private cache: CacheProvider,
    @inject(ProjectRepository) private projects: ProjectRepository,
    @inject(TOKENS.JobQueue) private queue: IJobQueueService,
  ) {}

  async start(): Promise<void> {
    await this.app.register(cors, { origin: false });
    await this.app.register(rateLimit, {
      max: this.config.security.rateLimitMax,
      timeWindow: this.config.security.rateLimitWindowMs,
    });

    registerHealthRoutes(this.app, this.cache);
    if (this.config.metricsEnabled) {
      registerMetricsRoutes(this.app);
    }

    this.app.post(this.config.webhookPath, async (request, reply) => {
      const signature = request.headers['x-hub-signature-256'] as string | undefined;
      const event = request.headers['x-github-event'] as string;
      const deliveryId = request.headers['x-github-delivery'] as string;
      const rawBody = JSON.stringify(request.body);

      if (this.config.github.webhookSecret && signature) {
        if (!this.verifySignature(rawBody, signature, this.config.github.webhookSecret)) {
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      }

      reply.status(202).send({ received: true });

      void this.processWebhook(event, request.body as Record<string, unknown>, deliveryId).catch((err) => {
        this.logger.error({ err, event, deliveryId }, 'Webhook processing failed');
      });
    });

    await this.app.listen({ port: this.config.port, host: this.config.host });
    this.logger.info({ port: this.config.port, path: this.config.webhookPath }, 'Webhook server listening');
  }

  async stop(): Promise<void> {
    await this.app.close();
  }

  private verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  private async processWebhook(event: string, payload: Record<string, unknown>, deliveryId: string) {
    const dedupeKey = `webhook:${deliveryId}`;
    if (await this.cache.exists(dedupeKey)) return;
    await this.cache.set(dedupeKey, true, 86400);

    const repo = payload.repository as { id: number; full_name: string } | undefined;
    if (!repo) return;

    const project = await this.projects.findByGithubRepoId(BigInt(repo.id));
    if (!project?.id) return;

    switch (event) {
      case 'push': {
        const ref = (payload.ref as string)?.replace('refs/heads/', '') ?? 'main';
        const commits = payload.commits as { id: string }[] | undefined;
        for (const c of commits ?? []) {
          await this.queue.enqueueCommit({
            projectId: project.id,
            sha: c.id,
            branch: ref,
            guildId: this.config.discord.guildId ?? '',
          });
        }
        break;
      }
      case 'create': {
        this.logger.info({ event, repo: repo.full_name }, 'Branch/tag created');
        break;
      }
      case 'release': {
        this.logger.info({ event, repo: repo.full_name }, 'Release published');
        break;
      }
      default:
        this.logger.debug({ event }, 'Unhandled webhook event');
    }
  }
}
