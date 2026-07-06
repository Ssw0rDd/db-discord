/**
 * Application entry point.
 *
 * Boot order: config → DI container → Discord bot → job queue → scheduler → HTTP webhook.
 * Shutdown (Ctrl+C): offline UI sync → stop queue/webhook → exit (see core/lifecycle/shutdown.service.ts).
 *
 * Architecture map: docs/ARCHITECTURE.md
 */
import 'reflect-metadata';
import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import { container } from 'tsyringe';
import { loadConfig } from './config/index.js';
import { registerDependencies } from './core/di/container.js';
import { TOKENS } from './core/di/tokens.js';
import { createLogger } from './core/logging/logger.js';
import { EventBus } from './core/events/event-bus.js';
import { shutdownService } from './core/lifecycle/shutdown.service.js';
import { DiscordBot } from './infrastructure/discord/discord-bot.js';
import { WebhookServer } from './infrastructure/http/webhook-server.js';
import { SchedulerService } from './infrastructure/scheduler/scheduler.service.js';
import type { IQueueRunner } from './domain/services/queue.interface.js';
import type { ICacheService } from './domain/repositories/index.js';

async function bootstrap(): Promise<void> {
  await mkdir('./data', { recursive: true });
  await mkdir('./tmp/backups', { recursive: true });

  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  registerDependencies(container, config, logger);

  const eventBus = container.resolve(EventBus);
  const discordBot = container.resolve(DiscordBot);
  const webhookServer = container.resolve(WebhookServer);
  const queueRunner = container.resolve<IQueueRunner>(TOKENS.QueueRunner);
  const scheduler = container.resolve(SchedulerService);
  const cache = container.resolve<ICacheService & { ping(): Promise<boolean> }>(TOKENS.Cache);

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
  });

  shutdownService.register(async (signal) => {
    logger.info({ signal }, 'Shutting down — syncing offline panels...');
    await discordBot.stop();
    await queueRunner.stop();
    await webhookServer.stop();
    if ('disconnect' in cache && typeof cache.disconnect === 'function') {
      await cache.disconnect();
    }
  }, logger);

  logger.info('Starting Db-Discord platform...');

  await discordBot.start();
  await queueRunner.start();
  await scheduler.start();

  try {
    await webhookServer.start();
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === 'EADDRINUSE') {
      logger.warn(
        { port: config.port },
        'Porta HTTP em uso — webhook desativado nesta instância. Encerre o processo antigo ou mude PORT no .env',
      );
    } else {
      logger.error({ err }, 'Webhook server falhou — bot Discord continua ativo');
    }
  }

  eventBus.emit('system.started', { timestamp: new Date() });
  logger.info({ port: config.port, cache: config.cache.mode, queue: config.queue.mode }, 'Platform ready');
}

bootstrap().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
