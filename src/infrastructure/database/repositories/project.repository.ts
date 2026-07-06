import { injectable, inject } from 'tsyringe';
import type { PrismaClient } from '@prisma/client';
import { TOKENS } from '../../../core/di/tokens.js';
import type { IProjectRepository } from '../../../domain/repositories/index.js';
import type { ProjectEntity, ProjectStats } from '../../../domain/entities/index.js';

@injectable()
export class ProjectRepository implements IProjectRepository {
  constructor(@inject(TOKENS.Prisma) private prisma: PrismaClient) {}

  private map(row: {
    id: string;
    guildConfigId: string;
    githubRepoId: bigint;
    fullName: string;
    name: string;
    defaultBranch: string;
    discordChannelId: string | null;
    panelMessageId: string | null;
    webhookId: bigint | null;
    isActive: boolean;
    lastSyncedAt: Date | null;
  }): ProjectEntity {
    return {
      id: row.id,
      guildConfigId: row.guildConfigId,
      githubRepoId: row.githubRepoId,
      fullName: row.fullName,
      name: row.name,
      defaultBranch: row.defaultBranch,
      discordChannelId: row.discordChannelId,
      panelMessageId: row.panelMessageId,
      webhookId: row.webhookId,
      isActive: row.isActive,
      lastSyncedAt: row.lastSyncedAt,
    };
  }

  async findById(id: string): Promise<ProjectEntity | null> {
    const row = await this.prisma.project.findUnique({ where: { id } });
    return row ? this.map(row) : null;
  }

  async findByGithubRepoId(githubRepoId: bigint): Promise<ProjectEntity | null> {
    const row = await this.prisma.project.findUnique({ where: { githubRepoId } });
    return row ? this.map(row) : null;
  }

  async findByChannelId(channelId: string): Promise<ProjectEntity | null> {
    const row = await this.prisma.project.findUnique({ where: { discordChannelId: channelId } });
    return row ? this.map(row) : null;
  }

  async findByGuild(guildConfigId: string): Promise<ProjectEntity[]> {
    const rows = await this.prisma.project.findMany({ where: { guildConfigId, isActive: true } });
    return rows.map((r) => this.map(r));
  }

  async findAllWithChannels(guildConfigId: string): Promise<ProjectEntity[]> {
    const rows = await this.prisma.project.findMany({
      where: { guildConfigId, discordChannelId: { not: null } },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.map(r));
  }

  async create(project: ProjectEntity): Promise<ProjectEntity> {
    const row = await this.prisma.project.create({
      data: {
        guildConfigId: project.guildConfigId,
        githubRepoId: project.githubRepoId,
        fullName: project.fullName,
        name: project.name,
        defaultBranch: project.defaultBranch,
        discordChannelId: project.discordChannelId,
        panelMessageId: project.panelMessageId,
        webhookId: project.webhookId,
        isActive: project.isActive,
      },
    });
    return this.map(row);
  }

  async update(id: string, data: Partial<ProjectEntity>): Promise<ProjectEntity> {
    const row = await this.prisma.project.update({
      where: { id },
      data: {
        discordChannelId: data.discordChannelId,
        panelMessageId: data.panelMessageId,
        webhookId: data.webhookId,
        isActive: data.isActive,
        lastSyncedAt: data.lastSyncedAt,
        defaultBranch: data.defaultBranch,
      },
    });
    return this.map(row);
  }

  async getStats(projectId: string): Promise<ProjectStats> {
    const [commitCount, branchCount, releaseCount, latestCommit] = await Promise.all([
      this.prisma.commitRecord.count({ where: { projectId } }),
      this.prisma.branchRecord.count({ where: { projectId } }),
      this.prisma.releaseRecord.count({ where: { projectId } }),
      this.prisma.commitRecord.findFirst({
        where: { projectId },
        orderBy: { authorDate: 'desc' },
        select: { authorDate: true, tag: true, shortSha: true },
      }),
    ]);

    return {
      commitCount,
      branchCount,
      releaseCount,
      lastBackupAt: latestCommit?.authorDate ?? null,
      currentVersion: latestCommit?.tag ?? latestCommit?.shortSha ?? null,
    };
  }

  async findOrCreateGuildConfig(discordGuildId: string): Promise<string> {
    const existing = await this.prisma.guildConfig.findUnique({ where: { discordGuildId } });
    if (existing) return existing.id;
    const created = await this.prisma.guildConfig.create({ data: { discordGuildId } });
    return created.id;
  }
}
