/**
 * Refreshes all project panels and commit thread UIs for a guild.
 *
 * Called on: bot start (online), shutdown (offline), /config language change.
 * botOnline=false removes action buttons and shows offline notice.
 */
import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import { ProjectRepository } from '../../infrastructure/database/repositories/project.repository.js';
import { CommitRepository } from '../../infrastructure/database/repositories/commit.repository.js';
import { GuildConfigRepository } from '../../infrastructure/database/repositories/guild-config.repository.js';
import { DiscordChannelService } from '../../infrastructure/discord/discord-channel.service.js';
import { EmojiConfigService } from '../../infrastructure/discord/emojis/emoji-config.service.js';

@injectable()
export class RefreshUiUseCase {
  constructor(
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(ProjectRepository) private projects: ProjectRepository,
    @inject(CommitRepository) private commits: CommitRepository,
    @inject(GuildConfigRepository) private guildConfig: GuildConfigRepository,
    @inject(DiscordChannelService) private discord: DiscordChannelService,
    @inject(EmojiConfigService) private emojis: EmojiConfigService,
  ) {}

  async execute(discordGuildId: string, online: boolean): Promise<{ panels: number; commits: number }> {
    this.emojis.reload();

    const settings = await this.guildConfig.getSettings(discordGuildId);
    const locale = settings.language;

    const guildConfigId = await this.projects.findOrCreateGuildConfig(discordGuildId);
    const projectList = await this.projects.findAllWithChannels(guildConfigId);

    let panels = 0;
    let commitMessages = 0;
    let staleCommits = 0;
    let migratedCommits = 0;

    this.logger.info({ online, projects: projectList.length, locale }, 'Atualizando visual do Discord');

    for (const project of projectList) {
      if (!project.id || !project.discordChannelId) continue;

      const stats = await this.projects.getStats(project.id);

      try {
        const panelId = await this.discord.updateProjectPanel(
          project.discordChannelId,
          project.panelMessageId ?? null,
          project,
          stats,
          { botOnline: online, locale },
        );
        if (panelId !== project.panelMessageId) {
          await this.projects.update(project.id, { panelMessageId: panelId });
        }
        panels++;
      } catch (err) {
        this.logger.error({ err, project: project.fullName, online }, 'Falha ao atualizar painel');
      }

      const commitList = await this.commits.findByProject(project.id, 100);
      for (const commit of commitList) {
        if (!commit.discordThreadId) continue;

        const result = await this.discord.updateCommitMessage(
          commit.discordThreadId,
          commit.discordMessageId ?? '',
          commit,
          project.name,
          { botOnline: online, locale },
          project.discordChannelId,
        );

        if (result.status === 'ok') {
          commitMessages++;
          if (result.threadId || result.messageId) {
            migratedCommits++;
            if (commit.id) {
              await this.commits.update(commit.id, {
                discordThreadId: result.threadId ?? commit.discordThreadId,
                discordMessageId: result.messageId ?? commit.discordMessageId,
              });
            }
          }
        } else if (result.status === 'stale' && commit.id) {
          staleCommits++;
          await this.commits.update(commit.id, { discordMessageId: null, discordThreadId: null });
        }
      }
    }

    if (staleCommits > 0) {
      this.logger.info({ staleCommits }, 'Commits com thread/mensagem inexistente — referências limpas');
    }
    if (migratedCommits > 0) {
      this.logger.info({ migratedCommits }, 'Painéis de commit migrados para dentro do thread');
    }

    this.logger.info(
      { online, panels, commitMessages, staleCommits, migratedCommits, projects: projectList.length },
      online ? 'Visual atualizado — bot online' : 'Visual atualizado — bot offline',
    );

    return { panels, commits: commitMessages };
  }
}
