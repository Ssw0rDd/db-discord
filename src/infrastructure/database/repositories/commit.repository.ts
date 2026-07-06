import { injectable, inject } from 'tsyringe';
import type { PrismaClient } from '@prisma/client';
import { TOKENS } from '../../../core/di/tokens.js';
import type { ICommitRepository } from '../../../domain/repositories/index.js';
import type { CommitEntity, SearchQuery, SearchResult } from '../../../domain/entities/index.js';

@injectable()
export class CommitRepository implements ICommitRepository {
  constructor(@inject(TOKENS.Prisma) private prisma: PrismaClient) {}

  private map(row: {
    id: string;
    projectId: string;
    sha: string;
    shortSha: string;
    message: string;
    authorName: string;
    authorEmail: string;
    authorDate: Date;
    branch: string;
    tag: string | null;
    filesChanged: number;
    additions: number;
    deletions: number;
    discordThreadId: string | null;
    discordMessageId: string | null;
    isPinned: boolean;
    isRelease: boolean;
  }): CommitEntity {
    return {
      id: row.id,
      projectId: row.projectId,
      sha: row.sha,
      shortSha: row.shortSha,
      message: row.message,
      authorName: row.authorName,
      authorEmail: row.authorEmail,
      authorDate: row.authorDate,
      branch: row.branch,
      tag: row.tag,
      stats: {
        filesChanged: row.filesChanged,
        additions: row.additions,
        deletions: row.deletions,
      },
      discordThreadId: row.discordThreadId,
      discordMessageId: row.discordMessageId,
      isPinned: row.isPinned,
      isRelease: row.isRelease,
    };
  }

  async findBySha(projectId: string, sha: string): Promise<CommitEntity | null> {
    const row = await this.prisma.commitRecord.findUnique({
      where: { projectId_sha: { projectId, sha } },
    });
    return row ? this.map(row) : null;
  }

  async findByProject(projectId: string, limit = 20, offset = 0): Promise<CommitEntity[]> {
    const rows = await this.prisma.commitRecord.findMany({
      where: { projectId },
      orderBy: { authorDate: 'desc' },
      take: limit,
      skip: offset,
    });
    return rows.map((r) => this.map(r));
  }

  async create(commit: CommitEntity): Promise<CommitEntity> {
    const row = await this.prisma.commitRecord.create({
      data: {
        projectId: commit.projectId,
        sha: commit.sha,
        shortSha: commit.shortSha,
        message: commit.message,
        authorName: commit.authorName,
        authorEmail: commit.authorEmail,
        authorDate: commit.authorDate,
        branch: commit.branch,
        tag: commit.tag,
        filesChanged: commit.stats.filesChanged,
        additions: commit.stats.additions,
        deletions: commit.stats.deletions,
        discordThreadId: commit.discordThreadId,
        discordMessageId: commit.discordMessageId,
        isPinned: commit.isPinned ?? false,
        isRelease: commit.isRelease ?? false,
      },
    });
    return this.map(row);
  }

  async update(id: string, data: Partial<CommitEntity>): Promise<CommitEntity> {
    const row = await this.prisma.commitRecord.update({
      where: { id },
      data: {
        discordThreadId: data.discordThreadId,
        discordMessageId: data.discordMessageId,
        isPinned: data.isPinned,
        tag: data.tag,
      },
    });
    return this.map(row);
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const limit = query.limit ?? 20;
    const where: Record<string, unknown> = {};

    if (query.projectId) where.projectId = query.projectId;
    if (query.branch) where.branch = query.branch;
    if (query.author) where.authorName = { contains: query.author };

    if (query.query) {
      where.OR = [
        { message: { contains: query.query } },
        { sha: { startsWith: query.query } },
        { shortSha: { startsWith: query.query } },
        { authorName: { contains: query.query } },
        { tag: { contains: query.query } },
      ];
    }

    const rows = await this.prisma.commitRecord.findMany({
      where,
      take: limit,
      skip: query.offset ?? 0,
      orderBy: { authorDate: 'desc' },
      include: { project: { select: { name: true } } },
    });

    return rows.map((r) => ({
      type: 'commit' as const,
      id: r.id,
      title: r.shortSha,
      subtitle: r.message.slice(0, 120),
      sha: r.sha,
      projectId: r.projectId,
      projectName: r.project.name,
      date: r.authorDate,
    }));
  }

  async countByProject(projectId: string): Promise<number> {
    return this.prisma.commitRecord.count({ where: { projectId } });
  }

  async findRecent(projectId: string, limit = 15): Promise<CommitEntity[]> {
    return this.findByProject(projectId, limit);
  }

  async countSince(projectId: string, since: Date): Promise<number> {
    return this.prisma.commitRecord.count({
      where: { projectId, authorDate: { gte: since } },
    });
  }

  async getTimeline(projectId: string, days = 14): Promise<{ label: string; count: number }[]> {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const rows = await this.prisma.commitRecord.findMany({
      where: { projectId, authorDate: { gte: since } },
      select: { authorDate: true },
      orderBy: { authorDate: 'asc' },
    });

    const buckets = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      buckets.set(dayKey(d), 0);
    }

    for (const row of rows) {
      const key = dayKey(row.authorDate);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    return [...buckets.entries()].map(([key, count]) => ({
      label: formatDayLabel(key),
      count,
    }));
  }

  async getMonthlyTimeline(projectId: string, months = 6): Promise<{ label: string; count: number }[]> {
    const since = new Date();
    since.setDate(1);
    since.setHours(0, 0, 0, 0);
    since.setMonth(since.getMonth() - (months - 1));

    const rows = await this.prisma.commitRecord.findMany({
      where: { projectId, authorDate: { gte: since } },
      select: { authorDate: true },
    });

    const buckets = new Map<string, number>();
    for (let i = 0; i < months; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      buckets.set(monthKey(d), 0);
    }

    for (const row of rows) {
      const key = monthKey(row.authorDate);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    return [...buckets.entries()].map(([key, count]) => ({ label: key, count }));
  }

  async getTopAuthors(projectId: string, limit = 5): Promise<string[]> {
    const rows = await this.getTopAuthorRows(projectId, limit);
    return rows.map((r) => `${r.name} (${r.count})`);
  }

  async getTopAuthorNames(projectId: string, limit = 5): Promise<string[]> {
    const rows = await this.getTopAuthorRows(projectId, limit);
    return rows.map((r) => r.name);
  }

  async getAuthorTimeline(
    projectId: string,
    authors: string[],
    days = 14,
  ): Promise<{ label: string; counts: Record<string, number> }[]> {
    if (authors.length === 0) return [];

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const rows = await this.prisma.commitRecord.findMany({
      where: { projectId, authorDate: { gte: since }, authorName: { in: authors } },
      select: { authorDate: true, authorName: true },
      orderBy: { authorDate: 'asc' },
    });

    const buckets = new Map<string, Record<string, number>>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const counts: Record<string, number> = {};
      for (const author of authors) counts[author] = 0;
      buckets.set(dayKey(d), counts);
    }

    for (const row of rows) {
      const key = dayKey(row.authorDate);
      const bucket = buckets.get(key);
      if (bucket && row.authorName) {
        bucket[row.authorName] = (bucket[row.authorName] ?? 0) + 1;
      }
    }

    return [...buckets.entries()].map(([key, counts]) => ({
      label: formatDayLabel(key),
      counts,
    }));
  }

  private async getTopAuthorRows(projectId: string, limit: number) {
    const rows = await this.prisma.commitRecord.groupBy({
      by: ['authorName'],
      where: { projectId },
      _count: { authorName: true },
      orderBy: { _count: { authorName: 'desc' } },
      take: limit,
    });
    return rows.map((r) => ({ name: r.authorName, count: r._count.authorName }));
  }
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDayLabel(isoDay: string): string {
  const [, m, day] = isoDay.split('-');
  return `${day}/${m}`;
}
