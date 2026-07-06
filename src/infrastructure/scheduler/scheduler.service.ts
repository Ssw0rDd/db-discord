import { injectable, inject } from 'tsyringe';
import type { PrismaClient } from '@prisma/client';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import type { IJobQueueService } from '../../domain/services/queue.interface.js';

@injectable()
export class SchedulerService {
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    @inject(TOKENS.Prisma) private prisma: PrismaClient,
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(TOKENS.JobQueue) private queue: IJobQueueService,
  ) {}

  async start(): Promise<void> {
    // Intelligent sync: only repos without webhook, every 30 min
    this.interval = setInterval(() => void this.runFallbackSync(), 30 * 60 * 1000);
    this.logger.info('Scheduler started (fallback sync every 30min)');
  }

  private async runFallbackSync() {
    const projects = await this.prisma.project.findMany({
      where: { isActive: true, webhookId: null },
    });

    for (const p of projects) {
      await this.queue.enqueueSync({ projectId: p.id });
    }

    if (projects.length) {
      this.logger.info({ count: projects.length }, 'Fallback sync queued');
    }
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }
}
