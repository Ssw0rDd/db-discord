/**
 * Dependency injection (tsyringe).
 *
 * Registers all repositories, use cases, Discord services, queue/cache backends.
 * Switch Redis vs memory via CACHE_MODE and QUEUE_MODE in .env.
 *
 * To add a new service: register here + inject in constructor with @inject().
 */
import { DependencyContainer } from 'tsyringe';
import type { AppConfig } from '../../config/index.js';
import type { ILogger } from '../events/event-bus.js';
import { EventBus } from '../events/event-bus.js';
import { TOKENS } from './tokens.js';
import { PrismaClient } from '@prisma/client';
import { ProjectRepository } from '../../infrastructure/database/repositories/project.repository.js';
import { CommitRepository } from '../../infrastructure/database/repositories/commit.repository.js';
import { AuditRepository } from '../../infrastructure/database/repositories/audit.repository.js';
import { RedisCacheService } from '../../infrastructure/cache/redis-cache.service.js';
import { MemoryCacheService } from '../../infrastructure/cache/memory-cache.service.js';
import { GitHubService } from '../../infrastructure/github/github.service.js';
import { CompressionService } from '../../infrastructure/compression/compression.service.js';
import { DiscordClientService } from '../../infrastructure/discord/discord-client.service.js';
import { DiscordBot } from '../../infrastructure/discord/discord-bot.js';
import { DiscordChannelService } from '../../infrastructure/discord/discord-channel.service.js';
import { PermissionService } from '../../infrastructure/auth/permission.service.js';
import { WebhookServer } from '../../infrastructure/http/webhook-server.js';
import { QueueWorker } from '../../infrastructure/queue/queue-worker.js';
import { JobQueueService } from '../../infrastructure/queue/job-queue.service.js';
import { MemoryJobQueueService } from '../../infrastructure/queue/memory-job-queue.service.js';
import { SchedulerService } from '../../infrastructure/scheduler/scheduler.service.js';
import { SyncRepositoryUseCase } from '../../application/use-cases/sync-repository.use-case.js';
import { ProcessCommitUseCase } from '../../application/use-cases/process-commit.use-case.js';
import { GenerateZipUseCase } from '../../application/use-cases/generate-zip.use-case.js';
import { SearchCommitsUseCase } from '../../application/use-cases/search-commits.use-case.js';
import { CompareRefsUseCase } from '../../application/use-cases/compare-refs.use-case.js';
import { SetupProjectUseCase } from '../../application/use-cases/setup-project.use-case.js';
import { DiscoverProjectsUseCase } from '../../application/use-cases/discover-projects.use-case.js';
import { PushFileUseCase } from '../../application/use-cases/push-file.use-case.js';
import { EmojiConfigService } from '../../infrastructure/discord/emojis/emoji-config.service.js';
import { UiBuilderService } from '../../infrastructure/discord/components/ui-builder.service.js';
import { StatsChartService } from '../../infrastructure/discord/charts/stats-chart.service.js';
import { RefreshUiUseCase } from '../../application/use-cases/refresh-ui.use-case.js';
import { BotStateService } from '../../infrastructure/discord/lifecycle/bot-state.service.js';
import { PushUploadSessionService } from '../../infrastructure/discord/push-upload-session.service.js';
import { GuildConfigRepository } from '../../infrastructure/database/repositories/guild-config.repository.js';
import { I18nService } from '../../infrastructure/discord/i18n/i18n.service.js';
import { UiInteractionService } from '../../presentation/discord/ui-interaction.service.js';
import { InteractionHandler } from '../../presentation/discord/interaction-handler.js';
import { RegisterCommands } from '../../presentation/discord/register-commands.js';
import type { IJobQueueService, IQueueRunner } from '../../domain/services/queue.interface.js';
import type { ICacheService } from '../../domain/repositories/index.js';

export function registerDependencies(
  di: DependencyContainer,
  config: AppConfig,
  logger: ILogger,
): void {
  di.register(TOKENS.Config, { useValue: config });
  di.register(TOKENS.Logger, { useValue: logger });
  di.registerSingleton(EventBus, EventBus);

  const prisma = new PrismaClient();
  di.register(TOKENS.Prisma, { useValue: prisma });

  if (config.cache.mode === 'redis') {
    di.registerSingleton(RedisCacheService, RedisCacheService);
    di.register(TOKENS.Cache, { useToken: RedisCacheService });
  } else {
    di.registerSingleton(MemoryCacheService, MemoryCacheService);
    di.register(TOKENS.Cache, { useToken: MemoryCacheService });
  }

  if (config.queue.mode === 'redis') {
    di.registerSingleton(JobQueueService, JobQueueService);
    di.registerSingleton(QueueWorker, QueueWorker);
    di.register(TOKENS.JobQueue, { useToken: JobQueueService });
    di.register(TOKENS.QueueRunner, { useToken: QueueWorker });
  } else {
    di.registerSingleton(MemoryJobQueueService, MemoryJobQueueService);
    di.register(TOKENS.JobQueue, { useToken: MemoryJobQueueService });
    di.register(TOKENS.QueueRunner, { useToken: MemoryJobQueueService });
  }

  di.registerSingleton(ProjectRepository, ProjectRepository);
  di.registerSingleton(CommitRepository, CommitRepository);
  di.registerSingleton(AuditRepository, AuditRepository);
  di.registerSingleton(GitHubService, GitHubService);
  di.registerSingleton(CompressionService, CompressionService);
  di.registerSingleton(DiscordClientService, DiscordClientService);
  di.registerSingleton(DiscordBot, DiscordBot);
  di.registerSingleton(DiscordChannelService, DiscordChannelService);
  di.registerSingleton(PermissionService, PermissionService);
  di.registerSingleton(WebhookServer, WebhookServer);
  di.registerSingleton(SchedulerService, SchedulerService);

  di.registerSingleton(SyncRepositoryUseCase, SyncRepositoryUseCase);
  di.registerSingleton(ProcessCommitUseCase, ProcessCommitUseCase);
  di.registerSingleton(GenerateZipUseCase, GenerateZipUseCase);
  di.registerSingleton(SearchCommitsUseCase, SearchCommitsUseCase);
  di.registerSingleton(CompareRefsUseCase, CompareRefsUseCase);
  di.registerSingleton(SetupProjectUseCase, SetupProjectUseCase);
  di.registerSingleton(DiscoverProjectsUseCase, DiscoverProjectsUseCase);
  di.registerSingleton(PushFileUseCase, PushFileUseCase);
  di.registerSingleton(EmojiConfigService, EmojiConfigService);
  di.registerSingleton(UiBuilderService, UiBuilderService);
  di.registerSingleton(StatsChartService, StatsChartService);
  di.registerSingleton(UiInteractionService, UiInteractionService);
  di.registerSingleton(BotStateService, BotStateService);
  di.registerSingleton(PushUploadSessionService, PushUploadSessionService);
  di.registerSingleton(GuildConfigRepository, GuildConfigRepository);
  di.registerSingleton(I18nService, I18nService);
  di.registerSingleton(RefreshUiUseCase, RefreshUiUseCase);
  di.registerSingleton(InteractionHandler, InteractionHandler);
  di.registerSingleton(RegisterCommands, RegisterCommands);

  logger.info(
    { cache: config.cache.mode, queue: config.queue.mode, db: 'sqlite' },
    'Execution mode configured',
  );
}

export { container } from './container-instance.js';
export type { IJobQueueService, IQueueRunner, ICacheService };
