/**
 * Discord Components V2 UI builder (Container, TextDisplay, buttons, charts).
 *
 * All user-facing strings go through I18nService (locales/en-US.ts, pt-BR, es).
 * Pass { botOnline: false } to hide buttons on shutdown.
 */
import { injectable, inject } from 'tsyringe';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { ProjectEntity, ProjectStats, CommitEntity } from '../../../domain/entities/index.js';
import { EmojiConfigService } from '../emojis/emoji-config.service.js';
import { I18nService, DEFAULT_LOCALE, type LocaleKey } from '../i18n/i18n.service.js';

export const V2_FLAGS = MessageFlags.IsComponentsV2;
export const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export interface PageInfo {
  page: number;
  totalPages: number;
  totalItems: number;
}

export interface UiLocaleOptions {
  locale?: string;
  botOnline?: boolean;
}

@injectable()
export class UiBuilderService {
  constructor(
    @inject(EmojiConfigService) private emojis: EmojiConfigService,
    @inject(I18nService) private i18n: I18nService,
  ) {}

  private t(locale: string, key: LocaleKey): string {
    return this.i18n.t(locale, key);
  }

  private loc(locale?: string): string {
    return this.i18n.normalize(locale ?? DEFAULT_LOCALE);
  }

  private button(customId: string, label: string, emojiKey: string): ButtonBuilder {
    const emoji = this.emojis.resolve(emojiKey);
    const btn = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Secondary);
    if (typeof emoji === 'string') btn.setEmoji(emoji);
    else btn.setEmoji(emoji);
    return btn;
  }

  private row(...buttons: ButtonBuilder[]) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
  }

  private paginationRow(scope: string, id: string, page: PageInfo, locale: string, extra = ''): ActionRowBuilder<ButtonBuilder> | null {
    if (page.totalPages <= 1) return null;
    const base = extra ? `${scope}:${extra}:${id}` : `${scope}:${id}`;
    const buttons: ButtonBuilder[] = [];
    if (page.page > 0) {
      buttons.push(this.button(`page:${base}:${page.page - 1}`, this.t(locale, 'btn_prev'), 'prev'));
    }
    if (page.page < page.totalPages - 1) {
      buttons.push(this.button(`page:${base}:${page.page + 1}`, this.t(locale, 'btn_next'), 'next'));
    }
    if (!buttons.length) return null;
    return this.row(...buttons);
  }

  buildBotOfflinePanel(projectName: string, locale?: string) {
    const loc = this.loc(locale);
    const e = this.emojis;
    const content = new TextDisplayBuilder().setContent(
      `# ${e.text('project')} ${projectName}\n\n` +
        `${e.text('statusOffline')} **${this.t(loc, 'bot_offline_title')}**\n\n` +
        this.t(loc, 'bot_offline_body'),
    );
    const container = new ContainerBuilder().addTextDisplayComponents(content);
    return { components: [container], flags: V2_FLAGS };
  }

  buildCommitOfflinePanel(commit: CommitEntity, projectName: string, locale?: string) {
    const loc = this.loc(locale);
    const e = this.emojis;
    const title = commit.tag ?? commit.shortSha;
    const content = new TextDisplayBuilder().setContent(
      `# ${e.text('commit')} ${title}\n\n` +
        `${this.t(loc, 'project')} · ${projectName}\n` +
        `${this.t(loc, 'hash')} · \`${commit.shortSha}\`\n\n` +
        `${e.text('statusOffline')} **${this.t(loc, 'bot_offline_title')}**\n\n` +
        this.t(loc, 'bot_offline_body'),
    );
    const container = new ContainerBuilder().addTextDisplayComponents(content);
    return { components: [container], flags: V2_FLAGS };
  }

  buildProjectPanel(project: ProjectEntity, stats: ProjectStats, opts: UiLocaleOptions = {}) {
    const loc = this.loc(opts.locale);
    const botOnline = opts.botOnline !== false;

    if (!botOnline) {
      return this.buildBotOfflinePanel(project.name, loc);
    }

    const e = this.emojis;
    const status = `${e.text('statusOnline')} ${this.t(loc, 'status_online')}`;
    const lastBackup = stats.lastBackupAt ? formatRelative(stats.lastBackupAt, loc) : this.t(loc, 'never');
    const version = stats.currentVersion ?? '—';

    const header = new TextDisplayBuilder().setContent(
      `# ${e.text('project')} ${project.name}\n\n` +
        `${e.text('separator')}\n\n` +
        `**Status** · ${status}\n` +
        `**${this.t(loc, 'last_backup')}** · ${lastBackup}\n` +
        `**${this.t(loc, 'version')}** · \`${version}\`\n\n` +
        `**${this.t(loc, 'commits')}** · ${stats.commitCount}  ·  **${this.t(loc, 'branches')}** · ${stats.branchCount}  ·  **${this.t(loc, 'releases')}** · ${stats.releaseCount}`,
    );

    const container = new ContainerBuilder()
      .addTextDisplayComponents(header)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
      .addActionRowComponents(
        this.row(
          this.button(`panel:latest:${project.id}`, this.t(loc, 'btn_latest'), 'download'),
          this.button(`panel:history:${project.id}`, this.t(loc, 'btn_history'), 'history'),
          this.button(`panel:branches:${project.id}`, this.t(loc, 'btn_branches'), 'branches'),
          this.button(`panel:stats:${project.id}`, this.t(loc, 'btn_stats'), 'stats'),
        ),
      )
      .addActionRowComponents(
        this.row(
          this.button(`panel:compare:${project.id}`, this.t(loc, 'btn_compare'), 'compare'),
          this.button(`panel:search:${project.id}`, this.t(loc, 'btn_search'), 'search'),
          this.button(`panel:workspace:${project.id}`, this.t(loc, 'btn_workspace'), 'workspace'),
          this.button(`panel:sync:${project.id}`, this.t(loc, 'btn_sync'), 'sync'),
        ),
      );

    return { components: [container], flags: V2_FLAGS };
  }

  buildCommitThreadMessage(commit: CommitEntity, projectName: string, pinned = false, opts: UiLocaleOptions = {}) {
    const loc = this.loc(opts.locale);
    const botOnline = opts.botOnline !== false;

    if (!botOnline) {
      return { ...this.buildCommitOfflinePanel(commit, projectName, loc), threadName: commit.shortSha };
    }

    const e = this.emojis;
    const title = commit.tag ?? commit.shortSha;
    const firstLine = commit.message.split('\n')[0]?.slice(0, 120) ?? commit.message.slice(0, 120);
    const dateLocale = loc === 'pt-BR' ? 'pt-BR' : loc === 'es' ? 'es-ES' : 'en-US';

    const body =
      `# ${e.text('commit')} ${title}\n\n` +
      `${e.text('separator')}\n\n` +
      `**${this.t(loc, 'project')}** · ${projectName}\n` +
      `**${e.text('author')} ${this.t(loc, 'author')}** · ${commit.authorName}\n` +
      `**${e.text('calendar')} ${this.t(loc, 'date')}** · ${commit.authorDate.toLocaleString(dateLocale)}\n` +
      `**${this.t(loc, 'hash')}** · \`${commit.shortSha}\`\n\n` +
      `${firstLine}\n\n` +
      `**${this.t(loc, 'files')}** ${commit.stats.filesChanged}  ·  **+${commit.stats.additions}**  ·  **-${commit.stats.deletions}**` +
      (pinned ? `\n\n${e.text('pinActive')} **${this.t(loc, 'pinned')}**` : '');

    const content = new TextDisplayBuilder().setContent(body);
    const container = new ContainerBuilder()
      .addTextDisplayComponents(content)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(
        this.row(
          this.button(`commit:zip:${commit.projectId}:${commit.sha}`, this.t(loc, 'btn_download'), 'zip'),
          this.button(`commit:files:${commit.projectId}:${commit.sha}:0`, this.t(loc, 'files'), 'files'),
          this.button(`commit:diff:${commit.projectId}:${commit.sha}:0`, this.t(loc, 'btn_diff'), 'diff'),
          this.button(`commit:restore:${commit.projectId}:${commit.sha}`, this.t(loc, 'btn_restore'), 'restore'),
        ),
      )
      .addActionRowComponents(
        this.row(
          this.button(`commit:share:${commit.projectId}:${commit.sha}`, this.t(loc, 'btn_share'), 'share'),
          this.button(
            `commit:pin:${commit.projectId}:${commit.sha}`,
            pinned ? this.t(loc, 'btn_unpin') : this.t(loc, 'btn_pin'),
            pinned ? 'pinActive' : 'pin',
          ),
        ),
      );

    const threadName = `${title} · ${firstLine.slice(0, 40)}`.slice(0, 100);
    return { components: [container], flags: V2_FLAGS, threadName };
  }

  buildConfigPanel(settings: {
    language: string;
    chartStyle: string;
    adminRoleIds: string[];
    interactRoleIds: string[];
    viewRoleIds: string[];
    manageUserIds: string[];
  }) {
    const loc = this.loc(settings.language);
    const e = this.emojis;
    const fmt = (ids: string[]) => (ids.length ? ids.map((id) => `\`${id}\``).join(' ') : `_${this.t(loc, 'config_all')}_`);

    const header = new TextDisplayBuilder().setContent(
      `# ${e.text('settings')} ${this.t(loc, 'config_title')}\n\n` +
        `**${this.t(loc, 'config_lang')}** · \`${settings.language}\`\n` +
        `**${this.t(loc, 'config_chart')}** · \`${settings.chartStyle}\`\n\n` +
        `**${this.t(loc, 'config_roles_admin')}** · ${fmt(settings.adminRoleIds)}\n` +
        `**${this.t(loc, 'config_roles_interact')}** · ${fmt(settings.interactRoleIds)}\n` +
        `**${this.t(loc, 'config_roles_view')}** · ${fmt(settings.viewRoleIds)}\n` +
        `**${this.t(loc, 'config_admin_ids')}** · ${fmt(settings.manageUserIds)}`,
    );

    const container = new ContainerBuilder()
      .addTextDisplayComponents(header)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(
        this.row(
          this.button('cfg:lang:en-US', 'EN', 'settings'),
          this.button('cfg:lang:pt-BR', 'PT', 'settings'),
          this.button('cfg:lang:es', 'ES', 'settings'),
          this.button('cfg:chart:line', this.t(loc, 'config_chart_line'), 'chart'),
          this.button('cfg:chart:bar', this.t(loc, 'config_chart_bar'), 'chart'),
        ),
      )
      .addActionRowComponents(
        this.row(
          this.button('cfg:roles:admin', this.t(loc, 'config_roles_admin'), 'lock'),
          this.button('cfg:roles:interact', this.t(loc, 'config_roles_interact'), 'lock'),
          this.button('cfg:roles:view', this.t(loc, 'config_roles_view'), 'lock'),
          this.button('cfg:roles:users', this.t(loc, 'config_admin_ids'), 'author'),
        ),
      );

    return { components: [container], flags: V2_EPHEMERAL };
  }

  buildWorkspacePanel(project: ProjectEntity, locale?: string) {
    const loc = this.loc(locale);
    const e = this.emojis;
    const header = new TextDisplayBuilder().setContent(
      `# ${e.text('workspace')} ${project.name}\n` +
        `\`${project.fullName}\` · \`${project.defaultBranch}\``,
    );

    const container = new ContainerBuilder()
      .addTextDisplayComponents(header)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(
        this.row(
          this.button(`ws:push:${project.id}`, this.t(loc, 'btn_upload'), 'upload'),
          this.button(`ws:pull:${project.id}`, this.t(loc, 'btn_pull'), 'pull'),
          this.button(`ws:sync:${project.id}`, this.t(loc, 'btn_sync'), 'sync'),
        ),
      );

    return { components: [container], flags: V2_EPHEMERAL };
  }

  buildTextPanel(title: string, body: string, flags = V2_EPHEMERAL) {
    const content = new TextDisplayBuilder().setContent(`# ${title}\n\n${body}`);
    const container = new ContainerBuilder().addTextDisplayComponents(content);
    return { components: [container], flags };
  }

  buildQuickMessage(body: string, flags = V2_EPHEMERAL) {
    const container = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
    return { components: [container], flags };
  }

  buildPaginatedPanel(opts: {
    title: string;
    body: string;
    pageScope: string;
    pageId: string;
    page: PageInfo;
    pageExtra?: string;
    locale?: string;
    selectRow?: ActionRowBuilder<StringSelectMenuBuilder>;
  }) {
    const loc = this.loc(opts.locale);
    const content = new TextDisplayBuilder().setContent(
      `# ${opts.title}\n\n${opts.body}\n\n_${this.t(loc, 'page')} ${opts.page.page + 1} ${this.t(loc, 'of')} ${opts.page.totalPages}_`,
    );
    const container = new ContainerBuilder()
      .addTextDisplayComponents(content)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    if (opts.selectRow) container.addActionRowComponents(opts.selectRow);
    const nav = this.paginationRow(opts.pageScope, opts.pageId, opts.page, loc, opts.pageExtra);
    if (nav) container.addActionRowComponents(nav);

    return { components: [container], flags: V2_EPHEMERAL };
  }

  buildFilePickerPanel(opts: {
    title: string;
    body: string;
    selectCustomId: string;
    placeholder: string;
    options: { label: string; description?: string; value: string }[];
    page: PageInfo;
    pageScope: string;
    pageId: string;
    pageExtra?: string;
    locale?: string;
  }) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(opts.selectCustomId)
      .setPlaceholder(opts.placeholder)
      .addOptions(
        opts.options.map((o) => ({
          label: o.label.slice(0, 100),
          description: o.description?.slice(0, 100),
          value: o.value,
        })),
      );

    return this.buildPaginatedPanel({
      title: opts.title,
      body: opts.body,
      pageScope: opts.pageScope,
      pageId: opts.pageId,
      page: opts.page,
      pageExtra: opts.pageExtra,
      locale: opts.locale,
      selectRow: new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    });
  }

  buildStatsPanel(data: {
    projectName: string;
    commits: number;
    branches: number;
    releases: number;
    topAuthors: string[];
    weeklyTotal: number;
    chartAttachmentName?: string;
    locale?: string;
  }) {
    const loc = this.loc(data.locale);
    const e = this.emojis;
    const authors = data.topAuthors.length
      ? data.topAuthors.map((a, i) => `${i + 1}. ${a}`).join('\n')
      : `_${this.t(loc, 'no_data')}_`;

    const header = new TextDisplayBuilder().setContent(
      `# ${e.text('stats')} ${data.projectName}\n\n` +
        `**${this.t(loc, 'commits')}** · ${data.commits}\n` +
        `**${this.t(loc, 'branches')}** · ${data.branches}  ·  **${this.t(loc, 'releases')}** · ${data.releases}\n` +
        `**${this.t(loc, 'last_7_days')}** · ${data.weeklyTotal} commits\n\n` +
        `**${this.t(loc, 'top_contributors')}**\n${authors}`,
    );

    const container = new ContainerBuilder()
      .addTextDisplayComponents(header)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    if (data.chartAttachmentName) {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setDescription(`${e.text('chart')} ${this.t(loc, 'chart_commits')}`)
            .setURL(`attachment://${data.chartAttachmentName}`),
        ),
      );
    }

    return { components: [container], flags: V2_EPHEMERAL };
  }

  buildSearchResults(results: { title: string; subtitle: string; projectName: string }[], locale?: string) {
    const loc = this.loc(locale);
    const e = this.emojis;
    const lines = results.length
      ? results.map((r, i) => `**${i + 1}.** \`${r.title}\` · ${r.projectName}\n> ${r.subtitle}`).join('\n\n')
      : `_${this.t(loc, 'search_empty')}_`;

    return this.buildTextPanel(`${e.text('search')} ${this.t(loc, 'search_results')}`, lines);
  }

  buildFileDownloadPanel(title: string, body: string, attachmentName: string) {
    const content = new TextDisplayBuilder().setContent(`# ${title}\n\n${body}`);
    const container = new ContainerBuilder()
      .addTextDisplayComponents(content)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addFileComponents(new FileBuilder().setURL(`attachment://${attachmentName}`));
    return { components: [container], flags: V2_EPHEMERAL };
  }
}

function formatRelative(date: Date, locale: string): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const dateLocale = locale === 'pt-BR' ? 'pt-BR' : locale === 'es' ? 'es-ES' : 'en-US';
  if (mins < 60) return locale === 'pt-BR' ? `há ${mins} min` : locale === 'es' ? `hace ${mins} min` : `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return locale === 'pt-BR' ? `há ${hours}h` : locale === 'es' ? `hace ${hours}h` : `${hours}h ago`;
  return date.toLocaleDateString(dateLocale);
}

export function pageInfo(totalItems: number, page: number, pageSize: number): PageInfo {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return { page: Math.min(page, totalPages - 1), totalPages, totalItems };
}
