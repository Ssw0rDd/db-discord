import { injectable, inject } from 'tsyringe';
import type { AppConfig } from '../../config/index.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import { GitHubService } from '../../infrastructure/github/github.service.js';
import { SetupProjectUseCase } from './setup-project.use-case.js';
import { ProjectRepository } from '../../infrastructure/database/repositories/project.repository.js';
import { container } from '../../core/di/container-instance.js';
import type { IJobQueueService } from '../../domain/services/queue.interface.js';

export interface DiscoverResult {
  total: number;
  created: number;
  synced: number;
  skipped: number;
  errors: string[];
}

@injectable()
export class DiscoverProjectsUseCase {
  constructor(
    @inject(TOKENS.Config) private config: AppConfig,
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(GitHubService) private github: GitHubService,
    @inject(SetupProjectUseCase) private setupProject: SetupProjectUseCase,
    @inject(ProjectRepository) private projects: ProjectRepository,
  ) {}

  async execute(guildId: string, ownerOverride?: string): Promise<DiscoverResult> {
    const owner = ownerOverride ?? this.config.github.owner;
    const repos = await this.github.listRepositories(owner);
    const queue = container.resolve<IJobQueueService>(TOKENS.JobQueue);

    const result: DiscoverResult = {
      total: repos.length,
      created: 0,
      synced: 0,
      skipped: 0,
      errors: [],
    };

    this.logger.info({ total: repos.length, owner: owner ?? 'authenticated-user' }, 'Descoberta de repositórios iniciada');

    for (const repo of repos) {
      if (repo.archived) {
        result.skipped++;
        continue;
      }
      if (repo.fork && !this.config.github.includeForks) {
        result.skipped++;
        continue;
      }

      try {
        const existing = await this.projects.findByGithubRepoId(BigInt(repo.id));
        if (existing?.id) {
          await queue.enqueueSync({ projectId: existing.id });
          result.synced++;
          this.logger.info({ repo: repo.fullName }, 'Projeto existente — sync enfileirado');
          continue;
        }

        await this.setupProject.execute(guildId, repo.owner, repo.name);
        result.created++;
        this.logger.info({ repo: repo.fullName }, 'Projeto criado');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${repo.fullName}: ${msg}`);
        this.logger.error({ err, repo: repo.fullName }, 'Falha ao configurar repositório');
      }
    }

    this.logger.info(result, 'Descoberta de repositórios concluída');
    return result;
  }
}
