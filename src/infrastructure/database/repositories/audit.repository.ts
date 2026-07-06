import { injectable, inject } from 'tsyringe';
import type { PrismaClient } from '@prisma/client';
import { TOKENS } from '../../../core/di/tokens.js';
import type { IAuditRepository } from '../../../domain/repositories/index.js';

@injectable()
export class AuditRepository implements IAuditRepository {
  constructor(@inject(TOKENS.Prisma) private prisma: PrismaClient) {}

  async log(entry: {
    guildId: string;
    userId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        guildId: entry.guildId,
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : undefined,
      },
    });
  }
}
