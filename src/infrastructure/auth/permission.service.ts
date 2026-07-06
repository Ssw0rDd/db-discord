import { injectable, inject } from 'tsyringe';
import type { AppConfig } from '../../config/index.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { IPermissionService } from '../../domain/repositories/index.js';
import type { PrismaClient } from '@prisma/client';
import { GuildConfigRepository } from '../database/repositories/guild-config.repository.js';

function hasRole(memberRoleIds: string[], allowed: string[]): boolean {
  if (allowed.length === 0) return false;
  return memberRoleIds.some((id) => allowed.includes(id));
}

@injectable()
export class PermissionService implements IPermissionService {
  constructor(
    @inject(TOKENS.Config) private config: AppConfig,
    @inject(TOKENS.Prisma) private prisma: PrismaClient,
    @inject(GuildConfigRepository) private guildConfig: GuildConfigRepository,
  ) {}

  async isAdmin(userId: string): Promise<boolean> {
    return this.config.security.adminUserIds.includes(userId);
  }

  async isGuildAdmin(userId: string, guildId: string | null, memberRoleIds: string[] = []): Promise<boolean> {
    if (await this.isAdmin(userId)) return true;
    if (!guildId) return false;

    const settings = await this.guildConfig.getSettings(guildId);
    if (settings.manageUserIds.includes(userId)) return true;
    return hasRole(memberRoleIds, settings.adminRoleIds);
  }

  async canInteract(
    userId: string,
    projectId: string,
    guildId: string | null,
    memberRoleIds: string[] = [],
  ): Promise<boolean> {
    if (await this.isGuildAdmin(userId, guildId, memberRoleIds)) return true;
    if (!guildId) return false;

    const settings = await this.guildConfig.getSettings(guildId);
    if (settings.interactRoleIds.length === 0) return this.canView(userId, projectId, guildId, memberRoleIds);
    if (hasRole(memberRoleIds, settings.interactRoleIds)) return true;
    return this.canView(userId, projectId, guildId, memberRoleIds);
  }

  async canView(
    userId: string,
    projectId: string,
    guildId: string | null = null,
    memberRoleIds: string[] = [],
  ): Promise<boolean> {
    if (await this.isGuildAdmin(userId, guildId, memberRoleIds)) return true;

    if (guildId) {
      const settings = await this.guildConfig.getSettings(guildId);
      if (settings.viewRoleIds.length > 0 && !hasRole(memberRoleIds, settings.viewRoleIds)) {
        const perm = await this.prisma.projectPermission.findUnique({
          where: { projectId_discordUserId: { projectId, discordUserId: userId } },
        });
        if (!perm) return false;
      }
    }

    const perm = await this.prisma.projectPermission.findUnique({
      where: { projectId_discordUserId: { projectId, discordUserId: userId } },
    });
    if (perm) return true;

    if (guildId) {
      const settings = await this.guildConfig.getSettings(guildId);
      if (settings.viewRoleIds.length === 0) return true;
      return hasRole(memberRoleIds, settings.viewRoleIds);
    }

    return false;
  }

  async canDownload(userId: string, projectId: string, guildId?: string | null, memberRoleIds: string[] = []): Promise<boolean> {
    if (await this.isGuildAdmin(userId, guildId ?? null, memberRoleIds)) return true;
    const perm = await this.prisma.projectPermission.findUnique({
      where: { projectId_discordUserId: { projectId, discordUserId: userId } },
    });
    return perm?.role === 'CONTRIBUTOR' || perm?.role === 'ADMIN';
  }

  async canRestore(userId: string, projectId: string, guildId?: string | null, memberRoleIds: string[] = []): Promise<boolean> {
    if (await this.isGuildAdmin(userId, guildId ?? null, memberRoleIds)) return true;
    const perm = await this.prisma.projectPermission.findUnique({
      where: { projectId_discordUserId: { projectId, discordUserId: userId } },
    });
    return perm?.role === 'ADMIN';
  }
}

export function extractMemberRoleIds(member: unknown): string[] {
  if (!member || typeof member !== 'object' || !('roles' in member)) return [];
  const roles = (member as { roles: { cache?: { keys(): Iterable<string> } } }).roles;
  if (roles?.cache) return [...roles.cache.keys()];
  return [];
}
