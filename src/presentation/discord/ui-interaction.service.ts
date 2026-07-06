/**
 * Discord UI interactions (buttons, modals, select menus, push uploads).
 *
 * Custom ID conventions:
 *   panel:*   — project panel actions
 *   commit:*  — commit thread actions
 *   cfg:*     — /config panel
 *   ws:*      — workspace (push/pull/sync)
 *   modal:*   — modal submit handlers (see handleModal)
 *
 * Builds messages via UiBuilderService; business logic in application/use-cases/.
 */
import { injectable, inject } from 'tsyringe';
import { AttachmentBuilder } from 'discord.js';
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Message,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import { PermissionService, extractMemberRoleIds } from '../../infrastructure/auth/permission.service.js';
import type { IJobQueueService } from '../../domain/services/queue.interface.js';
import { ProjectRepository } from '../../infrastructure/database/repositories/project.repository.js';
import { CommitRepository } from '../../infrastructure/database/repositories/commit.repository.js';
import { GitHubService } from '../../infrastructure/github/github.service.js';
import { SearchCommitsUseCase } from '../../application/use-cases/search-commits.use-case.js';
import { CompareRefsUseCase } from '../../application/use-cases/compare-refs.use-case.js';
import { PushFileUseCase } from '../../application/use-cases/push-file.use-case.js';
import { RefreshUiUseCase } from '../../application/use-cases/refresh-ui.use-case.js';
import {
  UiBuilderService,
  V2_EPHEMERAL,
  pageInfo,
} from '../../infrastructure/discord/components/ui-builder.service.js';
import { StatsChartService } from '../../infrastructure/discord/charts/stats-chart.service.js';
import { EmojiConfigService } from '../../infrastructure/discord/emojis/emoji-config.service.js';
import { DiscordChannelService } from '../../infrastructure/discord/discord-channel.service.js';
import {
  PushUploadSessionService,
  resolveRepoPath,
  formatGithubPushError,
} from '../../infrastructure/discord/push-upload-session.service.js';
import { GuildConfigRepository } from '../../infrastructure/database/repositories/guild-config.repository.js';
import { I18nService, DEFAULT_LOCALE } from '../../infrastructure/discord/i18n/i18n.service.js';
import {
  formatDiffFileDetail,
  formatDiffSummary,
  formatFileListPage,
} from '../../infrastructure/discord/utils/diff-formatter.js';

const PAGE_SIZE = 8;
const FILE_PAGE_SIZE = 10;
const PUSH_UPLOAD_MS = 3 * 60_000;

@injectable()
export class UiInteractionService {
  constructor(
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(PermissionService) private permissions: PermissionService,
    @inject(TOKENS.JobQueue) private queue: IJobQueueService,
    @inject(ProjectRepository) private projects: ProjectRepository,
    @inject(CommitRepository) private commits: CommitRepository,
    @inject(GitHubService) private github: GitHubService,
    @inject(SearchCommitsUseCase) private search: SearchCommitsUseCase,
    @inject(CompareRefsUseCase) private compare: CompareRefsUseCase,
    @inject(PushFileUseCase) private pushFile: PushFileUseCase,
    @inject(UiBuilderService) private ui: UiBuilderService,
    @inject(StatsChartService) private charts: StatsChartService,
    @inject(EmojiConfigService) private emojis: EmojiConfigService,
    @inject(DiscordChannelService) private discord: DiscordChannelService,
    @inject(PushUploadSessionService) private pushSessions: PushUploadSessionService,
    @inject(GuildConfigRepository) private guildConfig: GuildConfigRepository,
    @inject(I18nService) private i18n: I18nService,
    @inject(RefreshUiUseCase) private refreshUi: RefreshUiUseCase,
  ) {}

  private roles(interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction) {
    return extractMemberRoleIds(interaction.member);
  }

  private async locale(guildId: string | null) {
    if (!guildId) return DEFAULT_LOCALE;
    const s = await this.guildConfig.getSettings(guildId);
    return this.i18n.normalize(s.language);
  }

  private quickPayload(text: string) {
    return this.ui.buildQuickMessage(text);
  }

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    const [scope, action, ...rest] = interaction.customId.split(':');

    if (scope === 'cfg') {
      await this.handleConfigButton(interaction, action!, rest);
      return;
    }

    if (scope === 'panel') {
      await this.handlePanelButton(interaction, action!, rest[0]!);
      return;
    }
    if (scope === 'commit') {
      await this.handleCommitButton(interaction, action!, rest[0]!, rest[1]!, rest[2]);
      return;
    }
    if (scope === 'page') {
      await this.handlePageButton(interaction, action!, rest);
      return;
    }
    if (scope === 'ws') {
      await this.handleWsButton(interaction, action!, rest[0]!);
    }
  }

  async handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const [scope, projectId, sha] = interaction.customId.split(':');
    if (scope !== 'filesel') return;

    const project = await this.projects.findById(projectId!);
    if (!project) {
      const p = this.quickPayload(`${this.emojis.text('error')} Project not found.`);
      await interaction.reply({ components: p.components, flags: p.flags });
      return;
    }

    if (!(await this.permissions.canDownload(interaction.user.id, projectId!))) {
      const p = this.quickPayload(`${this.emojis.text('lock')} Permission denied.`);
      await interaction.reply({ components: p.components, flags: p.flags });
      return;
    }

    const { owner, repo } = this.github.parseRepoFullName(project.fullName);
    const commit = await this.github.getCommit(owner, repo, sha!);
    const index = parseInt(interaction.values[0] ?? '0', 10);
    const filePath = commit.files[index];

    if (!filePath) {
      const p = this.quickPayload(`${this.emojis.text('error')} Invalid file.`);
      await interaction.reply({ components: p.components, flags: p.flags });
      return;
    }

    await interaction.deferUpdate();

    try {
      const result = await this.github.getFileContent(owner, repo, filePath, sha!);
      if ('tooLarge' in result) {
        await interaction.followUp(
          this.quickPayload(
            `${this.emojis.text('error')} File too large (${Math.round(result.size / 1024)}KB).\nOpen on GitHub: ${result.url}`,
          ),
        );
        return;
      }

      const file = new AttachmentBuilder(result.buffer, { name: result.filename });
      const payload = this.ui.buildFileDownloadPanel(
        `${this.emojis.text('files')} ${filePath}`,
        `**Commit** \`${sha!.slice(0, 7)}\` · **Size** ${Math.round(result.size / 1024)}KB\n\nUse the file component below to download.`,
        result.filename,
      );
      await interaction.followUp({ components: payload.components, files: [file], flags: payload.flags });
    } catch (err) {
      this.logger.warn({ err, filePath, sha }, 'File download failed');
      await interaction.followUp(this.quickPayload(`${this.emojis.text('error')} Could not download \`${filePath}\`.`));
    }
  }

  async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    const parts = interaction.customId.split(':');
    const scope = parts[0];
    const action = parts[1];

    if (scope === 'modal' && action === 'search') {
      const projectId = parts[2];
      const query = interaction.fields.getTextInputValue('query');
      await interaction.deferReply({ flags: V2_EPHEMERAL });
      const results = await this.search.execute({ query, projectId, limit: 10 });
      const loc = await this.locale(interaction.guildId);
      const payload = this.ui.buildSearchResults(results, loc);
      await interaction.editReply({ components: payload.components, flags: payload.flags });
      return;
    }

    if (scope === 'modal' && action === 'compare') {
      const projectId = parts[2];
      const base = interaction.fields.getTextInputValue('base');
      const head = interaction.fields.getTextInputValue('head');
      await interaction.deferReply({ flags: V2_EPHEMERAL });
      const result = await this.compare.execute(projectId!, base, head);
      const body =
        `Comparing **${result.baseRef}** → **${result.headRef}**\n\n` +
        `+${result.filesAdded.length} · -${result.filesRemoved.length} · ~${result.filesModified.length}\n` +
        `**Lines** +${result.stats.additions} / -${result.stats.deletions}`;
      const payload = this.ui.buildTextPanel(`${this.emojis.text('compare')} Compare`, body);
      await interaction.editReply({ components: payload.components, flags: payload.flags });
      return;
    }

    if (scope === 'modal' && action === 'restore') {
      const sha = parts[3];
      const confirm = interaction.fields.getTextInputValue('confirm');
      if (confirm.toUpperCase() !== 'RESTORE') {
        const p = this.quickPayload(`${this.emojis.text('error')} Type RESTORE exactly to confirm.`);
        await interaction.reply({ components: p.components, flags: p.flags });
        return;
      }
      const ok = this.quickPayload(
        `${this.emojis.text('restore')} Restore of \`${sha?.slice(0, 7)}\` recorded. (Automatic push coming soon)`,
      );
      await interaction.reply({ components: ok.components, flags: ok.flags });
      return;
    }

    if (scope === 'modal' && action === 'push') {
      const projectId = parts[2];
      const guildId = interaction.guildId;
      const roleIds = this.roles(interaction);
      if (!(await this.permissions.isGuildAdmin(interaction.user.id, guildId, roleIds))) {
        const p = this.quickPayload(`${this.emojis.text('lock')} Admins only.`);
        await interaction.reply({ components: p.components, flags: p.flags });
        return;
      }
      await interaction.deferReply({ flags: V2_EPHEMERAL });
      const loc = await this.locale(guildId);
      try {
        const folder = interaction.fields.getTextInputValue('folder');
        const commitMsg = interaction.fields.getTextInputValue('commit').trim();

        this.pushSessions.register({
          userId: interaction.user.id,
          projectId: projectId!,
          folder,
          commitMsg,
          interaction,
          expiresAt: Date.now() + PUSH_UPLOAD_MS,
          locale: loc,
        });

        await interaction.editReply(this.quickPayload(`${this.emojis.text('upload')} ${this.i18n.t(loc, 'push_wait')}`));
      } catch (err) {
        this.logger.warn({ err }, 'Push modal invalid');
        await interaction.editReply(this.quickPayload(`${this.emojis.text('error')} ${this.i18n.t(loc, 'push_invalid_path')}`));
      }
      return;
    }

    if (scope === 'modal' && action === 'cfg') {
      const guildId = interaction.guildId;
      const roleIds = this.roles(interaction);
      if (!guildId || !(await this.permissions.isGuildAdmin(interaction.user.id, guildId, roleIds))) {
        const loc = await this.locale(guildId);
        const p = this.quickPayload(`${this.emojis.text('lock')} ${this.i18n.t(loc, 'config_denied')}`);
        await interaction.reply({ components: p.components, flags: p.flags });
        return;
      }
      const field = parts[2];
      const raw = interaction.fields.getTextInputValue('value');
      const ids = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const patch: Record<string, string[]> = {};
      if (field === 'admin') patch.adminRoleIds = ids;
      else if (field === 'interact') patch.interactRoleIds = ids;
      else if (field === 'view') patch.viewRoleIds = ids;
      else if (field === 'users') patch.manageUserIds = ids;

      await this.guildConfig.updateSettings(guildId, patch);
      const settings = await this.guildConfig.getSettings(guildId);
      const payload = this.ui.buildConfigPanel(settings);
      await interaction.reply({ components: payload.components, flags: payload.flags });
      return;
    }

    if (scope === 'modal' && action === 'pull') {
      const projectId = parts[2];
      await interaction.deferReply({ flags: V2_EPHEMERAL });
      try {
        const path = interaction.fields.getTextInputValue('path');
        const project = await this.projects.findById(projectId!);
        if (!project) throw new Error('Project not found');
        const { owner, repo } = this.github.parseRepoFullName(project.fullName);
        const result = await this.github.getFileContent(owner, repo, path, project.defaultBranch);
        if ('tooLarge' in result) {
          await interaction.editReply(
            this.quickPayload(`${this.emojis.text('error')} File too large. Open: ${result.url}`),
          );
          return;
        }
        const filename = path.split('/').pop() ?? 'download';
        const file = new AttachmentBuilder(result.buffer, { name: filename });
        const payload = this.ui.buildFileDownloadPanel(
          `${this.emojis.text('pull')} ${path}`,
          `**Branch** \`${project.defaultBranch}\` · **Size** ${Math.round(result.size / 1024)}KB\n\nUse the file component below to download.`,
          filename,
        );
        await interaction.editReply({ components: payload.components, files: [file], flags: payload.flags });
      } catch {
        await interaction.editReply(this.quickPayload(`${this.emojis.text('error')} File not found on GitHub.`));
      }
    }
  }

  async handlePushAttachment(message: Message): Promise<void> {
    if (message.author.bot || message.attachments.size === 0) return;

    const session = this.pushSessions.get(message.author.id);
    if (!session) return;

    this.pushSessions.clear(message.author.id);
    const attachment = message.attachments.first()!;
    const loc = session.locale;

    let repoPath = '';
    try {
      repoPath = resolveRepoPath(session.folder, attachment.name);
      const commitMessage = session.commitMsg || `Upload: ${repoPath}`;

      await session.interaction.editReply(
        this.quickPayload(`${this.emojis.text('wait')} ${this.i18n.t(loc, 'push_sending')} \`${repoPath}\`...`),
      );

      const res = await fetch(attachment.url);
      const buffer = Buffer.from(await res.arrayBuffer());
      const result = await this.pushFile.execute({
        projectId: session.projectId,
        path: repoPath,
        message: commitMessage,
        content: buffer,
        userId: message.author.id,
      });

      void this.queue.enqueueSync({ projectId: session.projectId });
      await message.delete().catch(() => undefined);

      await session.interaction.editReply(
        this.quickPayload(`${this.emojis.text('success')} \`${repoPath}\` ${this.i18n.t(loc, 'push_ok')} · \`${result.sha.slice(0, 7)}\``),
      );
    } catch (err) {
      const code = formatGithubPushError(err);
      this.logger.error({ code, path: repoPath, status: (err as { status?: number }).status }, 'Push failed');
      let msg = this.i18n.t(loc, 'push_fail');
      if (code === 'PAT_GITHUB_SEM_PERMISSAO') msg = this.i18n.t(loc, 'push_pat');
      await session.interaction.editReply(this.quickPayload(`${this.emojis.text('error')} ${msg}`));
    }
  }

  async showConfigPanel(interaction: ButtonInteraction | import('discord.js').ChatInputCommandInteraction) {
    const guildId = interaction.guildId;
    const roleIds = extractMemberRoleIds(interaction.member);
    if (!guildId || !(await this.permissions.isGuildAdmin(interaction.user.id, guildId, roleIds))) {
      const loc = await this.locale(guildId);
      const p = this.quickPayload(`${this.emojis.text('lock')} ${this.i18n.t(loc, 'config_denied')}`);
      await interaction.reply({ components: p.components, flags: p.flags });
      return;
    }
    const settings = await this.guildConfig.getSettings(guildId);
    const payload = this.ui.buildConfigPanel(settings);
    await interaction.reply({ components: payload.components, flags: payload.flags });
  }

  private async handleConfigButton(interaction: ButtonInteraction, action: string, rest: string[]) {
    const guildId = interaction.guildId;
    const roleIds = this.roles(interaction);
    if (!guildId || !(await this.permissions.isGuildAdmin(interaction.user.id, guildId, roleIds))) {
      const loc = await this.locale(guildId);
      const p = this.quickPayload(`${this.emojis.text('lock')} ${this.i18n.t(loc, 'config_denied')}`);
      await interaction.reply({ components: p.components, flags: p.flags });
      return;
    }

    if (action === 'roles') {
      return this.showConfigRolesModal(interaction, rest[0]!);
    }

    await interaction.deferUpdate();

    if (action === 'lang') {
      await this.guildConfig.updateSettings(guildId, { language: rest[0]! });
    } else if (action === 'chart') {
      await this.guildConfig.updateSettings(guildId, { chartStyle: rest[0]! });
    }

    const settings = await this.guildConfig.getSettings(guildId);
    const payload = this.ui.buildConfigPanel(settings);
    await interaction.editReply({ components: payload.components, flags: payload.flags });

    if (action === 'lang') {
      void this.refreshUi.execute(guildId, true).catch((err) => {
        this.logger.error({ err, guildId }, 'Falha ao atualizar visual após troca de idioma');
      });
    }
  }

  private showConfigRolesModal(interaction: ButtonInteraction, field: string) {
    const labels: Record<string, string> = {
      admin: 'Admin role IDs (comma-separated)',
      interact: 'Interact role IDs (comma-separated)',
      view: 'View role IDs (comma-separated)',
      users: 'Admin user IDs (comma-separated)',
    };
    const modal = new ModalBuilder()
      .setCustomId(`modal:cfg:${field}`)
      .setTitle('Configure')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('value')
            .setLabel(labels[field] ?? 'Values')
            .setPlaceholder('123,456')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false),
        ),
      );
    return interaction.showModal(modal);
  }

  private async handlePageButton(interaction: ButtonInteraction, subAction: string, rest: string[]) {
    await interaction.deferUpdate();
    if (subAction === 'hist') {
      await this.renderHistory(interaction, rest[0]!, parseInt(rest[1] ?? '0', 10));
    } else if (subAction === 'file') {
      await this.renderFiles(interaction, rest[1]!, rest[0]!, parseInt(rest[2] ?? '0', 10));
    } else if (subAction === 'diff') {
      await this.renderDiff(interaction, rest[1]!, rest[0]!, parseInt(rest[2] ?? '0', 10));
    } else if (subAction === 'br') {
      await this.renderBranchesPage(interaction, rest[0]!, parseInt(rest[1] ?? '0', 10));
    }
  }

  private async handleWsButton(interaction: ButtonInteraction, action: string, projectId: string) {
    const guildId = interaction.guildId;
    const roleIds = this.roles(interaction);
    if (!(await this.permissions.isGuildAdmin(interaction.user.id, guildId, roleIds))) {
      const p = this.quickPayload(`${this.emojis.text('lock')} Workspace — admins only.`);
      await interaction.reply({ components: p.components, flags: p.flags });
      return;
    }

    if (action === 'push') return this.showPushModal(interaction, projectId);
    if (action === 'pull') return this.showPullModal(interaction, projectId);
    if (action === 'sync') {
      await interaction.deferReply({ flags: V2_EPHEMERAL });
      await this.queue.enqueueSync({ projectId });
      await interaction.editReply(this.quickPayload(`${this.emojis.text('sync')} Sync started.`));
    }
  }

  private async handlePanelButton(interaction: ButtonInteraction, action: string, projectId: string) {
    const guildId = interaction.guildId;
    const roleIds = this.roles(interaction);
    if (!(await this.permissions.canInteract(interaction.user.id, projectId, guildId, roleIds))) {
      const p = this.quickPayload(`${this.emojis.text('lock')} ${this.i18n.t(await this.locale(guildId), 'lock')}`);
      await interaction.reply({ components: p.components, flags: p.flags });
      return;
    }

    const project = await this.projects.findById(projectId);
    if (!project) {
      const p = this.quickPayload(`${this.emojis.text('error')} Project not found.`);
      await interaction.reply({ components: p.components, flags: p.flags });
      return;
    }

    switch (action) {
      case 'sync': {
        await interaction.deferReply({ flags: V2_EPHEMERAL });
        await this.queue.enqueueSync({ projectId });
        const stats = await this.projects.getStats(projectId);
        if (project.discordChannelId) {
          const loc = await this.locale(guildId);
          const panelId = await this.discord.updateProjectPanel(
            project.discordChannelId,
            project.panelMessageId ?? null,
            project,
            stats,
            { locale: loc, botOnline: true },
          );
          if (panelId !== project.panelMessageId) {
            await this.projects.update(projectId, { panelMessageId: panelId });
          }
        }
        await interaction.editReply(this.quickPayload(`${this.emojis.text('sync')} Syncing from GitHub... Panel refreshed.`));
        return;
      }
      case 'search':
        return this.showSearchModal(interaction, projectId);
      case 'compare':
        return this.showCompareModal(interaction, projectId);
      case 'workspace': {
        const loc = await this.locale(guildId);
        await interaction.reply({
          components: this.ui.buildWorkspacePanel(project, loc).components,
          flags: V2_EPHEMERAL,
        });
        return;
      }
      case 'stats':
        return this.showStats(interaction, projectId, project.name);
      case 'history':
        await interaction.deferReply({ flags: V2_EPHEMERAL });
        return this.renderHistory(interaction, projectId, 0);
      case 'branches':
        await interaction.deferReply({ flags: V2_EPHEMERAL });
        return this.renderBranchesPage(interaction, projectId, 0);
      case 'latest':
        if (!(await this.permissions.canDownload(interaction.user.id, projectId))) {
          const p = this.quickPayload(`${this.emojis.text('lock')} Permission denied.`);
          await interaction.reply({ components: p.components, flags: p.flags });
          return;
        }
        return this.handleLatest(interaction, project);
      default:
        await interaction.reply(this.quickPayload(`${this.emojis.text('error')} Unknown action.`));
    }
  }

  private async handleCommitButton(
    interaction: ButtonInteraction,
    action: string,
    projectId: string,
    sha: string,
    extra?: string,
  ) {
    const guildId = interaction.guildId;
    const roleIds = this.roles(interaction);
    if (!(await this.permissions.canInteract(interaction.user.id, projectId, guildId, roleIds))) {
      const p = this.quickPayload(`${this.emojis.text('lock')} ${this.i18n.t(await this.locale(guildId), 'lock')}`);
      await interaction.reply({ components: p.components, flags: p.flags });
      return;
    }

    const project = await this.projects.findById(projectId);
    if (!project) {
      const p = this.quickPayload(`${this.emojis.text('error')} Project not found.`);
      await interaction.reply({ components: p.components, flags: p.flags });
      return;
    }

    switch (action) {
      case 'zip':
        if (!(await this.permissions.canDownload(interaction.user.id, projectId))) {
          const p = this.quickPayload(`${this.emojis.text('lock')} Permission denied.`);
          await interaction.reply({ components: p.components, flags: p.flags });
          return;
        }
        await interaction.deferReply({ flags: V2_EPHEMERAL });
        await this.queue.enqueueZip({ projectId, sha, channelId: interaction.channelId, userId: interaction.user.id });
        await interaction.editReply(this.quickPayload(`${this.emojis.text('download')} Generating ZIP... it will appear in this channel shortly.`));
        return;

      case 'files':
        if (!(await this.permissions.canDownload(interaction.user.id, projectId))) {
          const p = this.quickPayload(`${this.emojis.text('lock')} Permission denied.`);
          await interaction.reply({ components: p.components, flags: p.flags });
          return;
        }
        await interaction.deferReply({ flags: V2_EPHEMERAL });
        return this.renderFiles(interaction, projectId, sha, parseInt(extra ?? '0', 10));

      case 'diff':
        await interaction.deferReply({ flags: V2_EPHEMERAL });
        return this.renderDiff(interaction, projectId, sha, parseInt(extra ?? '0', 10));

      case 'restore':
        return this.showRestoreModal(interaction, projectId, sha);

      case 'share': {
        const p = this.quickPayload(`${this.emojis.text('share')} https://github.com/${project.fullName}/commit/${sha}`);
        await interaction.reply({ components: p.components, flags: p.flags });
        return;
      }

      case 'pin': {
        const record = await this.commits.findBySha(projectId, sha);
        if (!record?.id) {
          const p = this.quickPayload(`${this.emojis.text('error')} Commit not indexed.`);
          await interaction.reply({ components: p.components, flags: p.flags });
          return;
        }
        const pinned = !record.isPinned;
        await this.commits.update(record.id, { isPinned: pinned });
        const pinPayload = this.quickPayload(
          pinned ? `${this.emojis.text('pinActive')} Commit pinned.` : `${this.emojis.text('pin')} Pin removed.`,
        );
        await interaction.reply({ components: pinPayload.components, flags: pinPayload.flags });
        return;
      }

      default:
        await interaction.reply(this.quickPayload(`${this.emojis.text('error')} Unknown action.`));
    }
  }

  private async showStats(interaction: ButtonInteraction, projectId: string, projectName: string) {
    await interaction.deferReply({ flags: V2_EPHEMERAL });
    const guildId = interaction.guildId;
    const guildSettings = guildId ? await this.guildConfig.getSettings(guildId) : null;
    const chartStyle = (guildSettings?.chartStyle === 'bar' ? 'bar' : 'line') as 'line' | 'bar';
    const stats = await this.projects.getStats(projectId);
    const authorNames = await this.commits.getTopAuthorNames(projectId, 5);
    let timeline = await this.commits.getAuthorTimeline(projectId, authorNames, 14);
    let periodLabel = '14 days';

    const hasActivity = timeline.some((point) => authorNames.some((author) => (point.counts[author] ?? 0) > 0));
    if (!hasActivity && authorNames.length > 0) {
      timeline = await this.commits.getAuthorTimeline(projectId, authorNames, 90);
      periodLabel = '90 days';
    }

    const topAuthors = await this.commits.getTopAuthors(projectId);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weeklyTotal = await this.commits.countSince(projectId, weekAgo);

    const chartName = 'stats-chart.png';
    const chartInput = {
      projectName,
      labels: timeline.map((d) => d.label),
      authors: authorNames,
      timeline,
      periodLabel,
      chartStyle,
    };

    try {
      const image = await this.charts.generateStatsImage(chartInput);
      const file = new AttachmentBuilder(image, { name: chartName });
      const payload = this.ui.buildStatsPanel({
        projectName,
        commits: stats.commitCount,
        branches: stats.branchCount,
        releases: stats.releaseCount,
        topAuthors,
        weeklyTotal,
        chartAttachmentName: chartName,
        locale: guildSettings?.language,
      });
      await interaction.editReply({ components: payload.components, files: [file], flags: payload.flags });
    } catch (err) {
      this.logger.warn({ err }, 'Chart failed — showing text only');
      const payload = this.ui.buildStatsPanel({
        projectName,
        commits: stats.commitCount,
        branches: stats.branchCount,
        releases: stats.releaseCount,
        topAuthors,
        weeklyTotal,
        locale: guildSettings?.language,
      });
      await interaction.editReply({ components: payload.components, flags: payload.flags });
    }
  }

  private async renderHistory(interaction: ButtonInteraction, projectId: string, pageNum: number) {
    const project = await this.projects.findById(projectId);
    const list = await this.commits.findRecent(projectId, 100);
    const page = pageInfo(list.length, pageNum, PAGE_SIZE);
    const slice = list.slice(page.page * PAGE_SIZE, (page.page + 1) * PAGE_SIZE);
    const loc = await this.locale(interaction.guildId);
    const dateLocale = loc === 'pt-BR' ? 'pt-BR' : loc === 'es' ? 'es-ES' : 'en-US';

    const body = slice.length
      ? slice
          .map(
            (c, i) =>
              `**${page.page * PAGE_SIZE + i + 1}.** \`${c.shortSha}\` · ${c.authorName}\n` +
              `> ${c.message.split('\n')[0]?.slice(0, 70)} · ${c.authorDate.toLocaleDateString(dateLocale)}`,
          )
          .join('\n\n')
      : '_No commits indexed yet. Use **Sync** on the panel._';

    const payload = this.ui.buildPaginatedPanel({
      title: `${this.emojis.text('history')} History — ${project?.name ?? 'project'}`,
      body,
      pageScope: 'hist',
      pageId: projectId,
      page,
    });
    await interaction.editReply({ components: payload.components, flags: payload.flags });
  }

  private async renderFiles(interaction: ButtonInteraction, projectId: string, sha: string, pageNum: number) {
    const project = await this.projects.findById(projectId);
    const { owner, repo } = this.github.parseRepoFullName(project!.fullName);
    const commit = await this.github.getCommit(owner, repo, sha);
    const allFiles = commit.files;

    if (!allFiles.length) {
      await interaction.editReply(this.quickPayload(`${this.emojis.text('files')} No files changed in this commit.`));
      return;
    }

    const page = pageInfo(allFiles.length, pageNum, FILE_PAGE_SIZE);
    const slice = allFiles.slice(page.page * FILE_PAGE_SIZE, (page.page + 1) * FILE_PAGE_SIZE);

    const payload = this.ui.buildFilePickerPanel({
      title: `${this.emojis.text('files')} Changed files`,
      body: formatFileListPage(allFiles, page.page, FILE_PAGE_SIZE),
      selectCustomId: `filesel:${projectId}:${sha}`,
      placeholder: 'Select a file to download',
      options: slice.map((f, i) => ({
        label: f.split('/').pop() ?? f,
        description: f,
        value: String(page.page * FILE_PAGE_SIZE + i),
      })),
      page,
      pageScope: 'file',
      pageId: projectId,
      pageExtra: sha,
    });
    await interaction.editReply({ components: payload.components, flags: payload.flags });
  }

  private async renderDiff(interaction: ButtonInteraction, projectId: string, sha: string, fileIdx: number) {
    const project = await this.projects.findById(projectId);
    const { owner, repo } = this.github.parseRepoFullName(project!.fullName);
    const files = await this.github.getCommitDiffFiles(owner, repo, sha);

    if (!files.length) {
      await interaction.editReply(this.quickPayload(`${this.emojis.text('diff')} No detailed diff available.`));
      return;
    }

    const idx = Math.min(Math.max(0, fileIdx), files.length - 1);
    const summary = formatDiffSummary(files);
    const detail = formatDiffFileDetail(files[idx]!, idx, files.length);

    const page: import('../../infrastructure/discord/components/ui-builder.service.js').PageInfo = {
      page: idx,
      totalPages: files.length,
      totalItems: files.length,
    };

    const payload = this.ui.buildPaginatedPanel({
      title: `${this.emojis.text('diff')} Changes · ${sha.slice(0, 7)}`,
      body: `${summary}\n\n${detail}`,
      pageScope: 'diff',
      pageId: projectId,
      pageExtra: sha,
      page,
    });
    await interaction.editReply({ components: payload.components, flags: payload.flags });
  }

  private async renderBranchesPage(interaction: ButtonInteraction, projectId: string, pageNum: number) {
    const project = await this.projects.findById(projectId);
    if (!project) return;
    const { owner, repo } = this.github.parseRepoFullName(project.fullName);

    try {
      const [branches, releases] = await Promise.all([
        this.github.listBranches(owner, repo),
        this.github.listReleases(owner, repo),
      ]);

      const page = pageInfo(branches.length, pageNum, PAGE_SIZE);
      const slice = branches.slice(page.page * PAGE_SIZE, (page.page + 1) * PAGE_SIZE);
      const branchBlock = slice.length ? slice.map((b) => `• \`${b}\``).join('\n') : '_No branches._';

      const releaseBlock = releases.length
        ? releases
            .slice(0, 5)
            .map((r) => `• \`${r.tag}\` · ${r.name}`)
            .join('\n')
        : '_No releases._';

      const body =
        `**${this.emojis.text('branches')} Branches** (${branches.length})\n${branchBlock}\n\n` +
        `**${this.emojis.text('releases')} Releases** (${releases.length})\n${releaseBlock}`;

      const payload = this.ui.buildPaginatedPanel({
        title: `${this.emojis.text('branches')} ${project.name}`,
        body,
        pageScope: 'br',
        pageId: projectId,
        page,
      });
      await interaction.editReply({ components: payload.components, flags: payload.flags });
    } catch {
      await interaction.editReply(this.quickPayload(`${this.emojis.text('error')} Failed to list branches/releases.`));
    }
  }

  private async handleLatest(
    interaction: ButtonInteraction,
    project: { id?: string; fullName: string; name: string; defaultBranch: string },
  ) {
    await interaction.deferReply({ flags: V2_EPHEMERAL });
    const { owner, repo } = this.github.parseRepoFullName(project.fullName);
    const sha =
      (await this.github.getLatestCommitSha(owner, repo, project.defaultBranch)) ??
      (await this.commits.findRecent(project.id!, 1))[0]?.sha;

    if (!sha) {
      await interaction.editReply(this.quickPayload(`${this.emojis.text('error')} No commits found.`));
      return;
    }

    await this.queue.enqueueZip({ projectId: project.id!, sha, channelId: interaction.channelId, userId: interaction.user.id });
    const payload = this.ui.buildTextPanel(
      `${this.emojis.text('download')} Latest version`,
      `**Branch** \`${project.defaultBranch}\`\n**Commit** \`${sha.slice(0, 7)}\`\n\nGenerating ZIP in this channel...`,
    );
    await interaction.editReply({ components: payload.components, flags: payload.flags });
  }

  private showSearchModal(interaction: ButtonInteraction, projectId: string) {
    const modal = new ModalBuilder()
      .setCustomId(`modal:search:${projectId}`)
      .setTitle('Search commits')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('query')
            .setLabel('Term (message, hash, author)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100),
        ),
      );
    return interaction.showModal(modal);
  }

  private showCompareModal(interaction: ButtonInteraction, projectId: string) {
    const modal = new ModalBuilder()
      .setCustomId(`modal:compare:${projectId}`)
      .setTitle('Compare versions')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('base').setLabel('Base (branch/tag/sha)').setStyle(TextInputStyle.Short).setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('head').setLabel('Head (branch/tag/sha)').setStyle(TextInputStyle.Short).setRequired(true),
        ),
      );
    return interaction.showModal(modal);
  }

  private showPushModal(interaction: ButtonInteraction, projectId: string) {
    const modal = new ModalBuilder()
      .setCustomId(`modal:push:${projectId}`)
      .setTitle('Upload file')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('folder')
            .setLabel('Folder (empty = root/main)')
            .setPlaceholder('docs or src/config')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(120),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('commit')
            .setLabel('Commit message (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100),
        ),
      );
    return interaction.showModal(modal);
  }

  private showPullModal(interaction: ButtonInteraction, projectId: string) {
    const modal = new ModalBuilder()
      .setCustomId(`modal:pull:${projectId}`)
      .setTitle('Download file from GitHub')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('path')
            .setLabel('File path (e.g. README.md)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
    return interaction.showModal(modal);
  }

  private async showRestoreModal(interaction: ButtonInteraction, projectId: string, sha: string) {
    if (!(await this.permissions.canRestore(interaction.user.id, projectId))) {
      const p = this.quickPayload(`${this.emojis.text('lock')} No permission to restore.`);
      return interaction.reply({ components: p.components, flags: p.flags });
    }
    const modal = new ModalBuilder()
      .setCustomId(`modal:restore:${projectId}:${sha}`)
      .setTitle('Restore version')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('confirm')
            .setLabel('Type RESTORE to confirm')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(20),
        ),
      );
    return interaction.showModal(modal);
  }
}
