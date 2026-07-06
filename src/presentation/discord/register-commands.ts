import { injectable, inject } from 'tsyringe';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import type { AppConfig } from '../../config/index.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';

@injectable()
export class RegisterCommands {
  constructor(
    @inject(TOKENS.Config) private config: AppConfig,
    @inject(TOKENS.Logger) private logger: ILogger,
  ) {}

  async register(): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Set up GitHub backup for a repository')
        .addStringOption((o) => o.setName('owner').setDescription('Repository owner').setRequired(true))
        .addStringOption((o) => o.setName('repo').setDescription('Repository name').setRequired(true)),
      new SlashCommandBuilder()
        .setName('discover')
        .setDescription('Discover GitHub repos and create channels + commit threads')
        .addStringOption((o) =>
          o.setName('owner').setDescription('User or org (optional — uses GITHUB_OWNER from .env)'),
        ),
      new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search commits globally')
        .addStringOption((o) => o.setName('query').setDescription('Search term').setRequired(true))
        .addStringOption((o) => o.setName('project').setDescription('Project ID (optional)')),
      new SlashCommandBuilder()
        .setName('compare')
        .setDescription('Compare two refs')
        .addStringOption((o) => o.setName('project').setDescription('Project ID').setRequired(true))
        .addStringOption((o) => o.setName('base').setDescription('Base ref').setRequired(true))
        .addStringOption((o) => o.setName('head').setDescription('Head ref').setRequired(true)),
      new SlashCommandBuilder()
        .setName('config')
        .setDescription('Bot settings panel (admin)'),
    ].map((c) => c.toJSON());

    const rest = new REST().setToken(this.config.discord.token);

    if (this.config.discord.guildId) {
      await rest.put(Routes.applicationGuildCommands(this.config.discord.clientId, this.config.discord.guildId), {
        body: commands,
      });
    } else {
      await rest.put(Routes.applicationCommands(this.config.discord.clientId), { body: commands });
    }

    this.logger.info({ count: commands.length, names: ['setup', 'discover', 'search', 'compare', 'config'] }, 'Slash commands registered');
  }
}
