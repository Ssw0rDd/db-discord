/**
 * Discord channels: project panels, commit threads, file/ZIP delivery.
 *
 * createCommitThread: starter message (text) → thread → V2 panel inside thread.
 * updateCommitMessage: finds bot panel in thread; migrates legacy IDs if needed.
 */
import { injectable, inject } from 'tsyringe';
import {
  AttachmentBuilder,
  ChannelType,
  MessageFlags,
  TextChannel,
  type AnyThreadChannel,
  type Message,
  type ThreadChannel,
} from 'discord.js';
import type { AppConfig } from '../../config/index.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import type { IDiscordChannelService } from '../../domain/repositories/index.js';
import type { CommitEntity, ProjectEntity, ProjectStats } from '../../domain/entities/index.js';
import { UiBuilderService, type UiLocaleOptions } from './components/ui-builder.service.js';
import { DiscordClientService } from './discord-client.service.js';

export type UpdateCommitResult = {
  status: 'ok' | 'stale' | 'error';
  threadId?: string;
  messageId?: string;
};

@injectable()
export class DiscordChannelService implements IDiscordChannelService {
  constructor(
    @inject(DiscordClientService) private discordClient: DiscordClientService,
    @inject(TOKENS.Config) private config: AppConfig,
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(UiBuilderService) private ui: UiBuilderService,
  ) {}

  async ensureBackupCategory(guildId: string): Promise<string> {
    const guild = await this.discordClient.client.guilds.fetch(guildId);
    const existing = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === this.config.discord.backupCategoryName,
    );
    if (existing) return existing.id;

    const category = await guild.channels.create({
      name: this.config.discord.backupCategoryName,
      type: ChannelType.GuildCategory,
    });
    this.logger.info({ categoryId: category.id }, 'Backup category created');
    return category.id;
  }

  async createProjectChannel(guildId: string, categoryId: string, projectName: string): Promise<string> {
    const guild = await this.discordClient.client.guilds.fetch(guildId);
    const channel = await guild.channels.create({
      name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 100),
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `Backup · ${projectName}`,
    });
    return channel.id;
  }

  async createCommitThread(
    channelId: string,
    commit: CommitEntity,
    projectName: string,
    opts: UiLocaleOptions = {},
  ) {
    const channel = await this.discordClient.client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error('Invalid channel for thread creation');
    }

    const textChannel = channel as TextChannel;
    const payload = this.ui.buildCommitThreadMessage(commit, projectName, false, opts);
    const threadName = (payload.threadName ?? commit.shortSha).slice(0, 100);

    const starter = await textChannel.send({ content: `**${threadName}**` });
    const thread = await starter.startThread({
      name: threadName,
      autoArchiveDuration: 10080,
      reason: `Commit ${commit.shortSha}`,
    });

    const panel = await thread.send({
      components: payload.components,
      flags: payload.flags as number,
    });

    return { threadId: thread.id, messageId: panel.id };
  }

  async updateProjectPanel(
    channelId: string,
    messageId: string | null,
    project: ProjectEntity,
    stats: ProjectStats,
    opts: UiLocaleOptions = {},
  ): Promise<string> {
    const channel = await this.discordClient.client.channels.fetch(channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) {
      throw new Error('Invalid channel for panel');
    }

    const payload = this.ui.buildProjectPanel(project, stats, opts);
    const flags = payload.flags as number;

    if (messageId) {
      try {
        const msg = await channel.messages.fetch(messageId);
        await this.editComponentsV2Message(msg, payload);
        return messageId;
      } catch (err) {
        this.logger.warn({ err, messageId, channelId }, 'Panel message not found, creating new');
      }
    }

    const msg = await channel.send({ components: payload.components, flags });
    await msg.pin().catch(() => undefined);
    return msg.id;
  }

  async updateCommitMessage(
    threadId: string,
    messageId: string,
    commit: CommitEntity,
    projectName: string,
    opts: UiLocaleOptions = {},
    parentChannelId?: string,
  ): Promise<UpdateCommitResult> {
    const thread = await this.resolveThread(threadId, messageId, parentChannelId);
    if (!thread) return { status: 'stale' };

    const payload = this.ui.buildCommitThreadMessage(commit, projectName, commit.isPinned, opts);
    let panel = await this.resolveCommitPanelMessage(thread, messageId);
    let reposted = false;

    if (!panel) {
      try {
        panel = await thread.send({
          components: payload.components,
          flags: payload.flags as number,
        });
        reposted = true;
      } catch (err) {
        this.logger.warn({ err, threadId: thread.id, sha: commit.shortSha }, 'Falha ao recriar painel no thread');
        return { status: 'error' };
      }
    }

    try {
      await this.editComponentsV2Message(panel, payload);
      const idsChanged = reposted || thread.id !== threadId || panel.id !== messageId;
      return {
        status: 'ok',
        ...(idsChanged ? { threadId: thread.id, messageId: panel.id } : {}),
      };
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: number }).code : undefined;
      if (code === 50021) {
        try {
          panel = await thread.send({
            components: payload.components,
            flags: payload.flags as number,
          });
          return { status: 'ok', threadId: thread.id, messageId: panel.id };
        } catch (sendErr) {
          this.logger.warn({ err: sendErr, threadId: thread.id, sha: commit.shortSha }, 'Falha ao repostar após system message');
          return { status: 'error' };
        }
      }
      this.logger.warn({ err, threadId: thread.id, sha: commit.shortSha }, 'Falha ao editar mensagem de commit');
      return { status: 'error' };
    }
  }

  private async editComponentsV2Message(
    message: Message,
    payload: { components: unknown[]; flags: unknown },
  ): Promise<void> {
    if (message.system) {
      throw Object.assign(new Error('System message'), { code: 50021 });
    }
    await message.edit({
      content: null,
      embeds: [],
      components: payload.components as never,
      flags: payload.flags as number,
      attachments: [],
    });
  }

  private async resolveThread(
    storedThreadId: string,
    fallbackMessageId: string,
    parentChannelId?: string,
  ): Promise<ThreadChannel | null> {
    const client = this.discordClient.client;

    try {
      const channel = await client.channels.fetch(storedThreadId);
      if (channel?.isThread()) return channel;
    } catch {
      /* id inválido como thread */
    }

    const parentId = parentChannelId;
    if (!parentId) return null;

    try {
      const parent = await client.channels.fetch(parentId);
      if (!parent?.isTextBased() || parent.isDMBased()) return null;

      const textParent = parent as TextChannel;
      const match = await this.findThreadByStoredIds(textParent, storedThreadId, fallbackMessageId);
      if (match) return match;
    } catch {
      return null;
    }

    return null;
  }

  private async findThreadByStoredIds(
    parent: TextChannel,
    storedThreadId: string,
    fallbackMessageId: string,
  ): Promise<ThreadChannel | null> {
    const ids = new Set([storedThreadId, fallbackMessageId].filter(Boolean));

    const check = async (threads: Iterable<AnyThreadChannel>) => {
      for (const thread of threads) {
        if (ids.has(thread.id)) return thread;
        try {
          const starter = await thread.fetchStarterMessage();
          if (starter && ids.has(starter.id)) return thread;
        } catch {
          /* starter indisponível */
        }
      }
      return null;
    };

    const active = await parent.threads.fetchActive();
    const fromActive = await check(active.threads.values());
    if (fromActive) return fromActive;

    try {
      const archived = await parent.threads.fetchArchived({ limit: 100 });
      return check(archived.threads.values());
    } catch {
      return null;
    }
  }

  private async resolveCommitPanelMessage(thread: ThreadChannel, fallbackMessageId: string): Promise<Message | null> {
    const botId = this.discordClient.client.user?.id;

    if (fallbackMessageId) {
      try {
        const inThread = await thread.messages.fetch(fallbackMessageId);
        if (!inThread.system && this.isBotPanelMessage(inThread, botId)) return inThread;
      } catch {
        /* não está no thread */
      }
    }

    try {
      const messages = await thread.messages.fetch({ limit: 25 });
      const panel = messages.find((m) => this.isBotPanelMessage(m, botId));
      if (panel) return panel;
    } catch {
      /* thread inacessível */
    }

    return null;
  }

  private isBotPanelMessage(message: Message, botId?: string): boolean {
    if (message.system) return false;
    if (botId && message.author.id !== botId) return false;
    return message.flags.has(MessageFlags.IsComponentsV2);
  }

  async sendZipAttachment(channelId: string, filePath: string, filename: string): Promise<void> {
    await this.sendChannelFile(channelId, filePath, filename, 'Backup generated');
  }

  async sendChannelMessage(channelId: string, content: string): Promise<void> {
    const channel = await this.discordClient.client.channels.fetch(channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    await channel.send({ content });
  }

  async sendChannelFile(
    channelId: string,
    source: string | Buffer,
    filename: string,
    content = 'File',
  ): Promise<void> {
    const channel = await this.discordClient.client.channels.fetch(channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;

    const attachment =
      typeof source === 'string'
        ? new AttachmentBuilder(source, { name: filename })
        : new AttachmentBuilder(source, { name: filename });

    await channel.send({ content, files: [attachment] });
  }
}
