import { injectable, inject } from 'tsyringe';
import { ProjectRepository } from '../../infrastructure/database/repositories/project.repository.js';
import { GitHubService } from '../../infrastructure/github/github.service.js';
import type { CompareResult } from '../../domain/entities/index.js';

@injectable()
export class CompareRefsUseCase {
  constructor(
    @inject(ProjectRepository) private projects: ProjectRepository,
    @inject(GitHubService) private github: GitHubService,
  ) {}

  async execute(projectId: string, baseRef: string, headRef: string): Promise<CompareResult> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new Error('Project not found');

    const { owner, repo } = this.github.parseRepoFullName(project.fullName);
    const result = await this.github.compareRefs(owner, repo, baseRef, headRef);

    return {
      baseRef,
      headRef,
      filesAdded: result.filesAdded,
      filesRemoved: result.filesRemoved,
      filesModified: result.filesModified,
      stats: result.stats,
      diff: result.patch,
    };
  }
}
