/**
 * Discord.js client lifecycle.
 *
 * - ready: register slash commands, refresh UI (online), optional auto-discover
 * - interactionCreate → InteractionHandler
 * - messageCreate → push upload attachments (Workspace flow)
 * - stop(): refresh UI offline, then destroy client
 */
import { injectable, inject } from 'tsyringe';
import type { AppConfig } from '../../config/index.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import { DiscoverProjectsUseCase } from '../../application/use-cases/discover-projects.use-case.js';
import { RefreshUiUseCase } from '../../application/use-cases/refresh-ui.use-case.js';
import { InteractionHandler } from '../../presentation/discord/interaction-handler.js';
import { UiInteractionService } from '../../presentation/discord/ui-interaction.service.js';
import { RegisterCommands } from '../../presentation/discord/register-commands.js';
import { BotStateService } from './lifecycle/bot-state.service.js';
import { DiscordClientService } from './discord-client.service.js';

@injectable()
export class DiscordBot {
  private ready = false;

  constructor(
    @inject(DiscordClientService) private discordClient: DiscordClientService,
    @inject(TOKENS.Config) private config: AppConfig,
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(InteractionHandler) private interactionHandler: InteractionHandler,
    @inject(RegisterCommands) private registerCommands: RegisterCommands,
    @inject(DiscoverProjectsUseCase) private discoverProjects: DiscoverProjectsUseCase,
    @inject(RefreshUiUseCase) private refreshUi: RefreshUiUseCase,
    @inject(BotStateService) private botState: BotStateService,
    @inject(UiInteractionService) private uiActions: UiInteractionService,
  ) {}

  get client() {
    return this.discordClient.client;
  }

  async start(): Promise<void> {
    const { client } = this.discordClient;

    client.once('ready', async () => {
      this.ready = true;
      this.logger.info({ user: client.user?.tag }, 'Discord bot connected');
      await this.registerCommands.register();

      const { recoveredFromCrash } = await this.botState.markStarting();
      if (recoveredFromCrash) {
        this.logger.warn('Desligamento inesperado detectado — recuperando visual');
      }

      if (this.config.discord.guildId) {
        try {
          const result = await this.refreshUi.execute(this.config.discord.guildId, true);
          this.logger.info(result, 'Painéis e threads atualizados na inicialização');
        } catch (err) {
          this.logger.error({ err }, 'Falha ao atualizar visual na inicialização');
        }
      }

      if (this.config.github.autoDiscover && this.config.discord.guildId) {
        this.logger.info('Auto-discover GitHub ativado — buscando repositórios...');
        void this.discoverProjects
          .execute(this.config.discord.guildId)
          .then((r) =>
            this.logger.info(
              { created: r.created, synced: r.synced, total: r.total, errors: r.errors.length },
              'Auto-discover concluído',
            ),
          )
          .catch((err) => this.logger.error({ err }, 'Auto-discover falhou'));
      }
    });

    client.on('interactionCreate', (interaction) => {
      void this.interactionHandler.handle(interaction);
    });

    client.on('messageCreate', (message) => {
      void this.uiActions.handlePushAttachment(message);
    });

    await client.login(this.config.discord.token);
  }

  async stop(): Promise<void> {
    if (this.config.discord.guildId && this.ready) {
      this.logger.info('SIGINT/SIGTERM — marcando painéis e commits como offline...');
      try {
        const result = await this.refreshUi.execute(this.config.discord.guildId, false);
        this.logger.info(result, 'Visual offline aplicado antes de desconectar');
      } catch (err) {
        this.logger.error({ err }, 'Falha ao marcar visual offline no shutdown');
      }
    }
    await this.botState.markStopping();
    this.discordClient.client.destroy();
  }

  isReady(): boolean {
    return this.ready;
  }
}
