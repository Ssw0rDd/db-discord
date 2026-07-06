import { injectable, inject } from 'tsyringe';
import { CommitRepository } from '../../infrastructure/database/repositories/commit.repository.js';
import type { SearchQuery } from '../../domain/entities/index.js';

@injectable()
export class SearchCommitsUseCase {
  constructor(@inject(CommitRepository) private commits: CommitRepository) {}

  async execute(query: SearchQuery) {
    return this.commits.search(query);
  }
}
