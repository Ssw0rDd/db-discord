import { injectable, inject } from 'tsyringe';
import type { PrismaClient } from '@prisma/client';
import { TOKENS } from '../../../core/di/tokens.js';

export interface GuildSettings {
  language: string;
  chartStyle: string;
  adminRoleIds: string[];
  interactRoleIds: string[];
  viewRoleIds: string[];
  manageUserIds: string[];
}

function parseIds(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinIds(ids: string[]): string {
  return ids.join(',');
}

@injectable()
export class GuildConfigRepository {
  constructor(@inject(TOKENS.Prisma) private prisma: PrismaClient) {}

  async findOrCreate(discordGuildId: string): Promise<GuildSettings & { id: string; discordGuildId: string }> {
    let row = await this.prisma.guildConfig.findUnique({ where: { discordGuildId } });
    if (!row) {
      row = await this.prisma.guildConfig.create({ data: { discordGuildId } });
    }
    return this.map(row);
  }

  async getSettings(discordGuildId: string): Promise<GuildSettings> {
    const row = await this.findOrCreate(discordGuildId);
    return {
      language: row.language,
      chartStyle: row.chartStyle,
      adminRoleIds: row.adminRoleIds,
      interactRoleIds: row.interactRoleIds,
      viewRoleIds: row.viewRoleIds,
      manageUserIds: row.manageUserIds,
    };
  }

  async updateSettings(
    discordGuildId: string,
    data: Partial<GuildSettings>,
  ): Promise<GuildSettings & { id: string; discordGuildId: string }> {
    await this.findOrCreate(discordGuildId);
    const row = await this.prisma.guildConfig.update({
      where: { discordGuildId },
      data: {
        language: data.language,
        chartStyle: data.chartStyle,
        adminRoleIds: data.adminRoleIds ? joinIds(data.adminRoleIds) : undefined,
        interactRoleIds: data.interactRoleIds ? joinIds(data.interactRoleIds) : undefined,
        viewRoleIds: data.viewRoleIds ? joinIds(data.viewRoleIds) : undefined,
        manageUserIds: data.manageUserIds ? joinIds(data.manageUserIds) : undefined,
      },
    });
    return this.map(row);
  }

  async getLanguageByGuildConfigId(guildConfigId: string): Promise<string> {
    const row = await this.prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
    return row?.language ?? 'en-US';
  }

  async getDiscordGuildId(guildConfigId: string): Promise<string | null> {
    const row = await this.prisma.guildConfig.findUnique({ where: { id: guildConfigId } });
    return row?.discordGuildId ?? null;
  }

  private map(row: {
    id: string;
    discordGuildId: string;
    language: string;
    chartStyle: string;
    adminRoleIds: string;
    interactRoleIds: string;
    viewRoleIds: string;
    manageUserIds: string;
  }) {
    return {
      id: row.id,
      discordGuildId: row.discordGuildId,
      language: row.language,
      chartStyle: row.chartStyle,
      adminRoleIds: parseIds(row.adminRoleIds),
      interactRoleIds: parseIds(row.interactRoleIds),
      viewRoleIds: parseIds(row.viewRoleIds),
      manageUserIds: parseIds(row.manageUserIds),
    };
  }
}
