import type { ICacheService } from '../repositories/index.js';

export const QUEUE_NAMES = {
  COMMITS: 'commits',
  ZIP: 'zip',
  SYNC: 'sync',
} as const;

export type CommitJobData = {
  projectId: string;
  sha: string;
  branch: string;
  guildId: string;
};

export type ZipJobData = {
  projectId: string;
  sha: string;
  channelId: string;
  userId: string;
};

export type SyncJobData = {
  projectId: string;
};

export interface IJobQueueService {
  enqueueCommit(data: CommitJobData): Promise<void>;
  enqueueZip(data: ZipJobData): Promise<void>;
  enqueueSync(data: SyncJobData): Promise<void>;
}

export interface IQueueRunner {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type CacheProvider = ICacheService & { ping(): Promise<boolean> };
