import { injectable, inject } from 'tsyringe';
import { Worker, type Job } from 'bullmq';
import type { AppConfig } from '../../config/index.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import { GenerateZipUseCase } from '../../application/use-cases/generate-zip.use-case.js';
import { ProcessCommitUseCase } from '../../application/use-cases/process-commit.use-case.js';
import { SyncRepositoryUseCase } from '../../application/use-cases/sync-repository.use-case.js';
import { QUEUE_NAMES, type CommitJobData, type SyncJobData, type ZipJobData } from '../../domain/services/queue.interface.js';

@injectable()
export class QueueWorker {
  private workers: Worker[] = [];

  constructor(
    @inject(TOKENS.Config) private config: AppConfig,
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(ProcessCommitUseCase) private processCommit: ProcessCommitUseCase,
    @inject(GenerateZipUseCase) private generateZip: GenerateZipUseCase,
    @inject(SyncRepositoryUseCase) private syncRepository: SyncRepositoryUseCase,
  ) {}

  async start(): Promise<void> {
    const connection = {
      url: this.config.queue.redisUrl,
      maxRetriesPerRequest: null,
    };

    const commitWorker = new Worker<CommitJobData>(
      QUEUE_NAMES.COMMITS,
      async (job: Job<CommitJobData>) => {
        await this.processCommit.execute(job.data);
      },
      { connection, concurrency: 2 },
    );

    const zipWorker = new Worker<ZipJobData>(
      QUEUE_NAMES.ZIP,
      async (job: Job<ZipJobData>) => {
        await this.generateZip.execute(job.data);
      },
      { connection, concurrency: 1 },
    );

    const syncWorker = new Worker<SyncJobData>(
      QUEUE_NAMES.SYNC,
      async (job: Job<SyncJobData>) => {
        await this.syncRepository.execute(job.data.projectId);
      },
      { connection, concurrency: 1 },
    );

    for (const w of [commitWorker, zipWorker, syncWorker]) {
      w.on('failed', (job, err) => {
        this.logger.error({ jobId: job?.id, err: err.message }, 'Job failed');
      });
    }

    this.workers = [commitWorker, zipWorker, syncWorker];
    this.logger.info('Queue workers started');
  }

  async stop(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
  }
}
