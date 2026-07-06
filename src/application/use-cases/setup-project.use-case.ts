import { injectable, inject } from 'tsyringe';
import type { AppConfig } from '../../config/index.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import { EventBus, DOMAIN_EVENTS } from '../../core/events/event-bus.js';
import { ProjectRepository } from '../../infrastructure/database/repositories/project.repository.js';
import { GitHubService } from '../../infrastructure/github/github.service.js';
import { DiscordChannelService } from '../../infrastructure/discord/discord-channel.service.js';
import type { IJobQueueService } from '../../domain/services/queue.interface.js';

@injectable()
export class SetupProjectUseCase {
  constructor(
    @inject(TOKENS.Config) private config: AppConfig,
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(EventBus) private eventBus: EventBus,
    @inject(ProjectRepository) private projects: ProjectRepository,
    @inject(GitHubService) private github: GitHubService,
    @inject(DiscordChannelService) private discord: DiscordChannelService,
    @inject(TOKENS.JobQueue) private queue: IJobQueueService,
  ) {}

  async execute(guildId: string, owner: string, repo: string) {
    const ghRepo = await this.github.getRepository(owner, repo);
    const guildConfigId = await this.projects.findOrCreateGuildConfig(guildId);

    const existing = await this.projects.findByGithubRepoId(BigInt(ghRepo.id));
    if (existing?.id) {
      await this.queue.enqueueSync({ projectId: existing.id });
      this.logger.info({ project: ghRepo.fullName }, 'Projeto já existe — sync enfileirado');
      return existing;
    }

    const categoryId = await this.discord.ensureBackupCategory(guildId);
    const channelId = await this.discord.createProjectChannel(guildId, categoryId, repo);

    const project = await this.projects.create({
      guildConfigId,
      githubRepoId: BigInt(ghRepo.id),
      fullName: ghRepo.fullName,
      name: repo,
      defaultBranch: ghRepo.defaultBranch,
      discordChannelId: channelId,
      isActive: true,
    });

    const stats = await this.projects.getStats(project.id!);
    const panelId = await this.discord.updateProjectPanel(channelId, null, project, stats, {
      locale: this.config.security.defaultLanguage,
      botOnline: true,
    });
    await this.projects.update(project.id!, { panelMessageId: panelId });

    if (this.config.github.webhookSecret) {
      const webhookUrl = `http://${this.config.host}:${this.config.port}${this.config.webhookPath}`;
      try {
        const wh = await this.github.createWebhook(owner, repo, webhookUrl, this.config.github.webhookSecret);
        await this.projects.update(project.id!, { webhookId: BigInt(wh.id) });
      } catch (err) {
        this.logger.warn({ err, repo: ghRepo.fullName }, 'Could not create webhook, will use sync fallback');
      }
    }

    await this.queue.enqueueSync({ projectId: project.id! });
    await this.eventBus.emit(DOMAIN_EVENTS.PROJECT_CREATED, { project });

    this.logger.info({ project: ghRepo.fullName, channelId }, 'Project setup complete');
    return project;
  }
}
