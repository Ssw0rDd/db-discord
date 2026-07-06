import type { CommitEntity, ProjectEntity, ProjectStats, SearchQuery, SearchResult } from '../entities/index.js';

export interface IProjectRepository {
  findById(id: string): Promise<ProjectEntity | null>;
  findByGithubRepoId(githubRepoId: bigint): Promise<ProjectEntity | null>;
  findByChannelId(channelId: string): Promise<ProjectEntity | null>;
  findByGuild(guildConfigId: string): Promise<ProjectEntity[]>;
  findAllWithChannels(guildConfigId: string): Promise<ProjectEntity[]>;
  create(project: ProjectEntity): Promise<ProjectEntity>;
  update(id: string, data: Partial<ProjectEntity>): Promise<ProjectEntity>;
  getStats(projectId: string): Promise<ProjectStats>;
}

export interface ICommitRepository {
  findBySha(projectId: string, sha: string): Promise<CommitEntity | null>;
  findByProject(projectId: string, limit?: number, offset?: number): Promise<CommitEntity[]>;
  create(commit: CommitEntity): Promise<CommitEntity>;
  update(id: string, data: Partial<CommitEntity>): Promise<CommitEntity>;
  search(query: SearchQuery): Promise<SearchResult[]>;
  countByProject(projectId: string): Promise<number>;
}

export interface IAuditRepository {
  log(entry: {
    guildId: string;
    userId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export interface IGitHubService {
  getRepository(owner: string, repo: string): Promise<{ id: number; fullName: string; defaultBranch: string }>;
  listRepositories(owner?: string): Promise<Array<{
    id: number;
    name: string;
    fullName: string;
    owner: string;
    defaultBranch: string;
    fork: boolean;
    archived: boolean;
    private: boolean;
  }>>;
  listCommits(owner: string, repo: string, branch?: string, since?: string, limit?: number): Promise<CommitEntity[]>;
  parseRepoFullName(fullName: string): { owner: string; repo: string };
  getCommit(owner: string, repo: string, sha: string): Promise<CommitEntity & { files: string[] }>;
  compareRefs(owner: string, repo: string, base: string, head: string): Promise<{
    filesAdded: string[];
    filesRemoved: string[];
    filesModified: string[];
    stats: { filesChanged: number; additions: number; deletions: number };
    patch?: string;
  }>;
  createWebhook(owner: string, repo: string, url: string, secret: string): Promise<{ id: number }>;
  getArchiveUrl(owner: string, repo: string, ref: string): string;
  downloadZipball(owner: string, repo: string, ref: string, outputPath: string): Promise<{ sizeBytes: number; filePath: string }>;
  getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string,
    maxBytes?: number,
  ): Promise<
    | { buffer: Buffer; filename: string; size: number }
    | { tooLarge: true; url: string; size: number }
  >;
  getLanguages(owner: string, repo: string): Promise<Record<string, number>>;
}

export interface ICompressionService {
  createZipFromGit(repoUrl: string, ref: string, outputPath: string): Promise<{ sizeBytes: number; filePath: string }>;
  cleanup(path: string): Promise<void>;
}

export interface IDiscordChannelService {
  ensureBackupCategory(guildId: string): Promise<string>;
  createProjectChannel(guildId: string, categoryId: string, projectName: string): Promise<string>;
  createCommitThread(channelId: string, commit: CommitEntity, projectName: string): Promise<{ threadId: string; messageId: string }>;
  updateProjectPanel(
    channelId: string,
    messageId: string | null,
    project: ProjectEntity,
    stats: ProjectStats,
    opts?: { botOnline?: boolean; locale?: string },
  ): Promise<string>;
  updateCommitMessage(
    threadId: string,
    messageId: string,
    commit: CommitEntity,
    projectName: string,
    opts?: { botOnline?: boolean; locale?: string },
    parentChannelId?: string,
  ): Promise<{ status: 'ok' | 'stale' | 'error'; threadId?: string; messageId?: string }>;
  sendZipAttachment(channelId: string, filePath: string, filename: string): Promise<void>;
  sendChannelMessage(channelId: string, content: string): Promise<void>;
  sendChannelFile(channelId: string, buffer: Buffer, filename: string, content?: string): Promise<void>;
}

export interface IPermissionService {
  canView(userId: string, projectId: string, guildId?: string | null, memberRoleIds?: string[]): Promise<boolean>;
  canDownload(userId: string, projectId: string, guildId?: string | null, memberRoleIds?: string[]): Promise<boolean>;
  canRestore(userId: string, projectId: string, guildId?: string | null, memberRoleIds?: string[]): Promise<boolean>;
  isAdmin(userId: string): Promise<boolean>;
  isGuildAdmin(userId: string, guildId: string | null, memberRoleIds?: string[]): Promise<boolean>;
  canInteract(userId: string, projectId: string, guildId: string | null, memberRoleIds?: string[]): Promise<boolean>;
}
