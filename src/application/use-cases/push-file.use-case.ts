import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import { ProjectRepository } from '../../infrastructure/database/repositories/project.repository.js';
import { GitHubService } from '../../infrastructure/github/github.service.js';

export interface PushFileInput {
  projectId: string;
  path: string;
  message: string;
  content: Buffer;
  userId: string;
}

@injectable()
export class PushFileUseCase {
  constructor(
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(ProjectRepository) private projects: ProjectRepository,
    @inject(GitHubService) private github: GitHubService,
  ) {}

  async execute(input: PushFileInput): Promise<{ sha: string; url: string }> {
    const project = await this.projects.findById(input.projectId);
    if (!project) throw new Error('Project not found');

    const { owner, repo } = this.github.parseRepoFullName(project.fullName);
    const result = await this.github.pushFile(
      owner,
      repo,
      input.path,
      input.message,
      input.content,
      project.defaultBranch,
    );

    this.logger.info(
      { project: project.fullName, path: input.path, userId: input.userId, sha: result.sha },
      'File pushed to GitHub',
    );

    return { sha: result.sha, url: `https://github.com/${project.fullName}/commit/${result.sha}` };
  }
}
