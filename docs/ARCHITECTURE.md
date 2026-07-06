# Architecture

Map of the codebase for onboarding. Default language: **English (`en-US`)**.

## Folder layout

```
src/
├── index.ts                 # Entry point — bootstrap, SIGINT shutdown, starts all services
├── config/                  # Zod env validation → AppConfig
├── core/
│   ├── di/                  # tsyringe container (registerDependencies)
│   ├── lifecycle/           # Graceful shutdown (SIGINT/SIGTERM)
│   ├── events/              # EventBus
│   └── security/            # Rate limiter
├── domain/
│   ├── entities/            # TypeScript types (Project, Commit, etc.)
│   └── repositories/        # Interface contracts (IDiscordChannelService, …)
├── application/use-cases/   # Business logic (one class ≈ one feature)
├── infrastructure/
│   ├── discord/             # Bot client, panels, threads, i18n, charts
│   ├── github/              # Octokit wrapper
│   ├── database/            # Prisma repositories
│   ├── queue/               # BullMQ or in-memory jobs
│   ├── http/                # Fastify webhook + health
│   └── cache/               # Redis or memory
└── presentation/discord/    # Slash commands, buttons, modals (UI layer)

prisma/schema.prisma         # SQLite schema (GuildConfig, Project, Commit, …)
config/emojis.json           # Emoji keys used in UiBuilderService
.env.example                 # Required env vars (copy to .env — never commit .env)
```

## Request flow (Discord)

1. **Discord** sends interaction → `discord-bot.ts` (`interactionCreate`)
2. **`interaction-handler.ts`** — rate limit, routes by type
3. **`ui-interaction.service.ts`** — buttons/modals/selects (most UI logic)
4. **Use cases** — e.g. `sync-repository`, `push-file`, `refresh-ui`
5. **`discord-channel.service.ts`** — send/edit panels & commit threads (Components V2)
6. **`ui-builder.service.ts`** — builds Container V2 payloads; strings from **`i18n/`**

## Where to change what

| Goal | Start here |
|------|------------|
| New slash command | `register-commands.ts` + `interaction-handler.ts` |
| New button / modal | `ui-interaction.service.ts` + `ui-builder.service.ts` |
| Translated labels | `infrastructure/discord/i18n/locales/en-US.ts` |
| Project / commit DB | `prisma/schema.prisma` → `npm run db:push` |
| GitHub API | `infrastructure/github/github.service.ts` |
| Background jobs | `infrastructure/queue/` + use case enqueued from UI |
| Permissions | `infrastructure/auth/permission.service.ts` + `GuildConfig` |
| Offline on shutdown | `shutdown.service.ts` → `discord-bot.stop()` → `refresh-ui.use-case.ts` |
| Emojis on buttons | `config/emojis.json` + `emoji-config.service.ts` |

## Important behaviors

- **Components V2**: panels use `MessageFlags.IsComponentsV2`; no legacy `content`/`embeds` on the same message.
- **Commit threads**: UI panel lives **inside** the thread; starter message is text-only (system message cannot be edited).
- **Interaction timeout**: always `deferReply` / `deferUpdate` within 3s before long work (e.g. full UI refresh).
- **Crash recovery**: `data/bot.state.json` — if `running: true` on start, bot assumes unclean exit and refreshes UI.

## Scripts

```bash
npm run dev          # tsx watch — local development
npm run build        # tsc → dist/
npm start            # production (node dist/index.js)
npm run db:push      # apply Prisma schema to SQLite
npm run lint         # tsc --noEmit
```

### Optional: GitHub CLI

```bash
gh repo create db-discord --public --source=. --remote=origin --push
```

Requires [GitHub CLI](https://cli.github.com/) and `gh auth login`.
