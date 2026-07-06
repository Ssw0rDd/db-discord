/**
 * Top-level Discord interaction router.
 *
 * Slash commands handled here; buttons/modals/selects delegated to UiInteractionService.
 * Always defer long operations within 3 seconds to avoid Unknown interaction (10062).
 */
import { injectable, inject } from 'tsyringe';
import type { Interaction, ChatInputCommandInteraction } from 'discord.js';
import type { AppConfig } from '../../config/index.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import { SearchCommitsUseCase } from '../../application/use-cases/search-commits.use-case.js';
import { SetupProjectUseCase } from '../../application/use-cases/setup-project.use-case.js';
import { DiscoverProjectsUseCase } from '../../application/use-cases/discover-projects.use-case.js';
import { UiBuilderService, V2_EPHEMERAL } from '../../infrastructure/discord/components/ui-builder.service.js';
import { UiInteractionService } from './ui-interaction.service.js';
import { EmojiConfigService } from '../../infrastructure/discord/emojis/emoji-config.service.js';
import { RateLimiter } from '../../core/security/rate-limiter.js';

@injectable()
export class InteractionHandler {
  private rateLimiter: RateLimiter;

  constructor(
    @inject(TOKENS.Config) config: AppConfig,
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(UiInteractionService) private uiActions: UiInteractionService,
    @inject(SearchCommitsUseCase) private search: SearchCommitsUseCase,
    @inject(SetupProjectUseCase) private setupProject: SetupProjectUseCase,
    @inject(DiscoverProjectsUseCase) private discoverProjects: DiscoverProjectsUseCase,
    @inject(UiBuilderService) private ui: UiBuilderService,
    @inject(EmojiConfigService) private emojis: EmojiConfigService,
  ) {
    this.rateLimiter = new RateLimiter(config.security.rateLimitMax, config.security.rateLimitWindowMs);
  }

  private errPayload(text: string) {
    return this.ui.buildQuickMessage(text);
  }

  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) {
      return;
    }

    if (!(await this.rateLimiter.check(interaction.user.id))) {
      if (interaction.isRepliable()) {
        const p = this.errPayload(`${this.emojis.text('wait')} Please wait a moment...`);
        await interaction.reply({ components: p.components, flags: p.flags });
      }
      return;
    }

    try {
      if (interaction.isChatInputCommand()) await this.handleCommand(interaction);
      else if (interaction.isButton()) await this.uiActions.handleButton(interaction);
      else if (interaction.isModalSubmit()) await this.uiActions.handleModal(interaction);
      else if (interaction.isStringSelectMenu()) await this.uiActions.handleSelect(interaction);
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: number }).code : undefined;
      if (code === 10062) {
        this.logger.warn({ type: interaction.type }, 'Interaction expired (Unknown interaction)');
        return;
      }
      this.logger.error({ err, type: interaction.type }, 'Interaction error');
      const p = this.errPayload(`${this.emojis.text('error')} Failed to process request.`);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ components: p.components, flags: p.flags }).catch(() => undefined);
      } else if (interaction.isRepliable() && interaction.deferred) {
        await interaction.editReply({ components: p.components, flags: p.flags }).catch(() => undefined);
      }
    }
  }

  private async handleCommand(interaction: ChatInputCommandInteraction) {
    if (interaction.commandName === 'setup') {
      const owner = interaction.options.getString('owner', true);
      const repo = interaction.options.getString('repo', true);
      const guildId = interaction.guildId;
      if (!guildId) {
        const p = this.errPayload(`${this.emojis.text('error')} Use this command in a server.`);
        await interaction.reply({ components: p.components, flags: p.flags });
        return;
      }
      await interaction.deferReply({ flags: V2_EPHEMERAL });
      const project = await this.setupProject.execute(guildId, owner, repo);
      const ok = this.ui.buildQuickMessage(`${this.emojis.text('success')} **${project.fullName}** · <#${project.discordChannelId}>`);
      await interaction.editReply({ components: ok.components, flags: ok.flags });
      return;
    }

    if (interaction.commandName === 'discover') {
      const guildId = interaction.guildId;
      if (!guildId) {
        const p = this.errPayload(`${this.emojis.text('error')} Use this command in a server.`);
        await interaction.reply({ components: p.components, flags: p.flags });
        return;
      }
      await interaction.deferReply({ flags: V2_EPHEMERAL });
      const owner = interaction.options.getString('owner') ?? undefined;
      const result = await this.discoverProjects.execute(guildId, owner);
      const ok = this.ui.buildQuickMessage(
        `${this.emojis.text('search')} **Discovery**\n` +
          `Total ${result.total} · Created ${result.created} · Synced ${result.synced} · Skipped ${result.skipped}`,
      );
      await interaction.editReply({ components: ok.components, flags: ok.flags });
      return;
    }

    if (interaction.commandName === 'search') {
      const query = interaction.options.getString('query', true);
      const projectId = interaction.options.getString('project');
      await interaction.deferReply({ flags: V2_EPHEMERAL });
      const results = await this.search.execute({ query, projectId: projectId ?? undefined, limit: 10 });
      const payload = this.ui.buildSearchResults(results);
      await interaction.editReply({ components: payload.components, flags: payload.flags });
      return;
    }

    if (interaction.commandName === 'config') {
      await this.uiActions.showConfigPanel(interaction);
    }
  }
}
