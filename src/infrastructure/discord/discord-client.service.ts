import { injectable } from 'tsyringe';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

@injectable()
export class DiscordClientService {
  readonly client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });
}
