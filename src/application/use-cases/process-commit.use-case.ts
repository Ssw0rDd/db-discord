import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import { EventBus, DOMAIN_EVENTS } from '../../core/events/event-bus.js';
import { ProjectRepository } from '../../infrastructure/database/repositories/project.repository.js';
import { CommitRepository } from '../../infrastructure/database/repositories/commit.repository.js';
import { GitHubService } from '../../infrastructure/github/github.service.js';
import { DiscordChannelService } from '../../infrastructure/discord/discord-channel.service.js';
import { GuildConfigRepository } from '../../infrastructure/database/repositories/guild-config.repository.js';
import type { CommitJobData } from '../../domain/services/queue.interface.js';
import type { CommitEntity } from '../../domain/entities/index.js';

@injectable()
export class ProcessCommitUseCase {
  constructor(
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(EventBus) private eventBus: EventBus,
    @inject(ProjectRepository) private projects: ProjectRepository,
    @inject(CommitRepository) private commits: CommitRepository,
    @inject(GitHubService) private github: GitHubService,
    @inject(DiscordChannelService) private discord: DiscordChannelService,
    @inject(GuildConfigRepository) private guildConfig: GuildConfigRepository,
  ) {}

  async execute(data: CommitJobData) {
    const project = await this.projects.findById(data.projectId);
    if (!project?.discordChannelId) return;

    const existing = await this.commits.findBySha(data.projectId, data.sha);
    if (existing?.discordThreadId) return;

    const { owner, repo } = this.github.parseRepoFullName(project.fullName);
    const ghCommit = await this.github.getCommit(owner, repo, data.sha);

    let commit: CommitEntity = existing ?? (await this.commits.create({
      projectId: data.projectId,
      sha: ghCommit.sha,
      shortSha: ghCommit.shortSha,
      message: ghCommit.message,
      authorName: ghCommit.authorName,
      authorEmail: ghCommit.authorEmail,
      authorDate: ghCommit.authorDate,
      branch: data.branch,
      stats: ghCommit.stats,
    }));

    if (existing) {
      commit = await this.commits.update(existing.id!, {
        message: ghCommit.message,
        authorName: ghCommit.authorName,
        branch: data.branch,
        stats: ghCommit.stats,
      });
    }

    const locale = await this.guildConfig.getLanguageByGuildConfigId(project.guildConfigId);

    const thread = await this.discord.createCommitThread(
      project.discordChannelId,
      commit,
      project.name,
      { locale, botOnline: true },
    );

    commit = await this.commits.update(commit.id!, {
      discordThreadId: thread.threadId,
      discordMessageId: thread.messageId,
    });

    const stats = await this.projects.getStats(data.projectId);
    await this.discord.updateProjectPanel(
      project.discordChannelId,
      project.panelMessageId ?? null,
      project,
      stats,
      { locale, botOnline: true },
    );

    await this.eventBus.emit(DOMAIN_EVENTS.COMMIT_RECEIVED, { commit, project });
    this.logger.info({ sha: data.sha, project: project.name }, 'Commit processado — thread criada');
  }
}
