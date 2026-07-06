import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import { ProcessCommitUseCase } from '../../application/use-cases/process-commit.use-case.js';
import { GenerateZipUseCase } from '../../application/use-cases/generate-zip.use-case.js';
import { SyncRepositoryUseCase } from '../../application/use-cases/sync-repository.use-case.js';
import {
  type CommitJobData,
  type IJobQueueService,
  type IQueueRunner,
  type SyncJobData,
  type ZipJobData,
} from '../../domain/services/queue.interface.js';

@injectable()
export class MemoryJobQueueService implements IJobQueueService, IQueueRunner {
  private commitQueue: CommitJobData[] = [];
  private zipQueue: ZipJobData[] = [];
  private syncQueue: SyncJobData[] = [];
  private commitPending = new Set<string>();
  private running = false;
  private processing = false;

  constructor(
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(ProcessCommitUseCase) private processCommit: ProcessCommitUseCase,
    @inject(GenerateZipUseCase) private generateZip: GenerateZipUseCase,
    @inject(SyncRepositoryUseCase) private syncRepository: SyncRepositoryUseCase,
  ) {}

  async start(): Promise<void> {
    this.running = true;
    this.logger.info('Fila em memória iniciada (modo Termux/mobile)');
    void this.processLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async enqueueCommit(data: CommitJobData): Promise<void> {
    const key = `${data.projectId}:${data.sha}`;
    if (this.commitPending.has(key)) return;
    this.commitPending.add(key);
    this.commitQueue.push(data);
    void this.processLoop();
  }

  async enqueueZip(data: ZipJobData): Promise<void> {
    this.zipQueue.push(data);
    void this.processLoop();
  }

  async enqueueSync(data: SyncJobData): Promise<void> {
    this.syncQueue.push(data);
    void this.processLoop();
  }

  private async processLoop(): Promise<void> {
    if (this.processing || !this.running) return;
    this.processing = true;

    try {
      while (this.running) {
        const syncJob = this.syncQueue.shift();
        if (syncJob) {
          await this.safeRun(() => this.syncRepository.execute(syncJob.projectId));
          continue;
        }

        const commitJob = this.commitQueue.shift();
        if (commitJob) {
          await this.safeRun(() => this.processCommit.execute(commitJob));
          this.commitPending.delete(`${commitJob.projectId}:${commitJob.sha}`);
          continue;
        }

        const zipJob = this.zipQueue.shift();
        if (zipJob) {
          await this.safeRun(() => this.generateZip.execute(zipJob));
          continue;
        }

        break;
      }
    } finally {
      this.processing = false;
    }
  }

  private async safeRun(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error({ err }, 'Job em memória falhou');
    }
  }
}
