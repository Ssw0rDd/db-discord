import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import type { AppConfig } from '../../config/index.js';
import { ProjectRepository } from '../../infrastructure/database/repositories/project.repository.js';
import { GitHubService } from '../../infrastructure/github/github.service.js';
import type { IJobQueueService } from '../../domain/services/queue.interface.js';
import { container } from '../../core/di/container-instance.js';

@injectable()
export class SyncRepositoryUseCase {
  constructor(
    @inject(TOKENS.Config) private config: AppConfig,
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(ProjectRepository) private projects: ProjectRepository,
    @inject(GitHubService) private github: GitHubService,
  ) {}

  async execute(projectId: string) {
    const queue = container.resolve<IJobQueueService>(TOKENS.JobQueue);
    const project = await this.projects.findById(projectId);
    if (!project) return;

    const { owner, repo } = this.github.parseRepoFullName(project.fullName);
    const isInitialSync = !project.lastSyncedAt;
    const since = isInitialSync ? undefined : project.lastSyncedAt!.toISOString();
    const limit = isInitialSync ? this.config.github.initialSyncCommits : 30;

    const commits = await this.github.listCommits(owner, repo, project.defaultBranch, since, limit);

    if (!commits.length && isInitialSync) {
      this.logger.warn({ project: project.fullName }, 'Repositório vazio ou sem commits na branch padrão');
    }

    for (const c of commits.reverse()) {
      await queue.enqueueCommit({
        projectId,
        sha: c.sha,
        branch: project.defaultBranch,
        guildId: this.config.discord.guildId ?? '',
      });
    }

    await this.projects.update(projectId, { lastSyncedAt: new Date() });
    this.logger.info(
      { project: project.fullName, count: commits.length, initial: isInitialSync },
      'Repository synced',
    );
  }
}
