export interface CommitStats {
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface CommitEntity {
  id?: string;
  projectId: string;
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authorDate: Date;
  branch: string;
  tag?: string | null;
  stats: CommitStats;
  discordThreadId?: string | null;
  discordMessageId?: string | null;
  isPinned?: boolean;
  isRelease?: boolean;
}

export interface ProjectEntity {
  id?: string;
  guildConfigId: string;
  githubRepoId: bigint;
  fullName: string;
  name: string;
  defaultBranch: string;
  discordChannelId?: string | null;
  panelMessageId?: string | null;
  webhookId?: bigint | null;
  isActive: boolean;
  lastSyncedAt?: Date | null;
}

export interface ProjectStats {
  commitCount: number;
  branchCount: number;
  releaseCount: number;
  lastBackupAt?: Date | null;
  currentVersion?: string | null;
}

export interface SearchQuery {
  query: string;
  projectId?: string;
  guildId?: string;
  branch?: string;
  author?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  type: 'commit' | 'branch' | 'release' | 'file';
  id: string;
  title: string;
  subtitle: string;
  sha?: string;
  projectId: string;
  projectName: string;
  date?: Date;
}

export interface CompareResult {
  baseRef: string;
  headRef: string;
  filesAdded: string[];
  filesRemoved: string[];
  filesModified: string[];
  stats: CommitStats;
  diff?: string;
}

export interface RestoreRequest {
  projectId: string;
  sha: string;
  userId: string;
  userName: string;
}
