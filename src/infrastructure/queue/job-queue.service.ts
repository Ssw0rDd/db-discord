import { injectable, inject } from 'tsyringe';
import { Queue } from 'bullmq';
import type { AppConfig } from '../../config/index.js';
import { TOKENS } from '../../core/di/tokens.js';
import {
  QUEUE_NAMES,
  type CommitJobData,
  type IJobQueueService,
  type SyncJobData,
  type ZipJobData,
} from '../../domain/services/queue.interface.js';

export { QUEUE_NAMES, type CommitJobData, type SyncJobData, type ZipJobData };

@injectable()
export class JobQueueService implements IJobQueueService {
  readonly commitQueue: Queue<CommitJobData>;
  readonly zipQueue: Queue<ZipJobData>;
  readonly syncQueue: Queue<SyncJobData>;

  constructor(@inject(TOKENS.Config) config: AppConfig) {
    const connection = {
      url: config.queue.redisUrl,
      maxRetriesPerRequest: null,
    };
    const defaultJobOptions = {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 2000 },
    };

    this.commitQueue = new Queue(QUEUE_NAMES.COMMITS, { connection, defaultJobOptions });
    this.zipQueue = new Queue(QUEUE_NAMES.ZIP, { connection, defaultJobOptions });
    this.syncQueue = new Queue(QUEUE_NAMES.SYNC, { connection, defaultJobOptions });
  }

  async enqueueCommit(data: CommitJobData) {
    await this.commitQueue.add('process', data, { jobId: `${data.projectId}:${data.sha}` });
  }

  async enqueueZip(data: ZipJobData) {
    await this.zipQueue.add('generate', data);
  }

  async enqueueSync(data: SyncJobData) {
    await this.syncQueue.add('sync', data, { jobId: `sync:${data.projectId}` });
  }
}
