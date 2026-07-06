# Db-Discord

GitHub backup and versioning bot for Discord.

| Language | README |
|----------|--------|
| Português | [docs/README.pt-BR.md](docs/README.pt-BR.md) |
| English | [docs/README.en-US.md](docs/README.en-US.md) |
| Español | [docs/README.es.md](docs/README.es.md) |

## Quick start

```bash
git clone <your-repo-url> db-discord
cd db-discord
cp .env.example .env
npm install
npm run db:push
npm run dev
```

Fill `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `GITHUB_PAT`, `ADMIN_USER_IDS` in `.env`.

## Hosting guides

| Platform | Guide |
|----------|-------|
| VPS (Linux) | [docs/hosting/vps.md](docs/hosting/vps.md) |
| Termux (Android) | [docs/hosting/termux.md](docs/hosting/termux.md) |
| Local PC (dev) | [docs/hosting/local.md](docs/hosting/local.md) |

## Architecture

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for folder layout, request flow, and where to change features.

## Publish to GitHub

This folder is not a git repo until you run `git init`. **Never commit `.env`** (tokens).

```bash
cd db-discord
git init
git add .
git status          # .env must NOT appear
git commit -m "Initial commit: Db-Discord bot"
git branch -M main
git remote add origin https://github.com/YOUR_USER/db-discord.git
git push -u origin main
```

Create the empty repo on GitHub first: [github.com/new](https://github.com/new). Full steps in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#publish-to-github).

## Discord commands

| Command | Description |
|---------|-------------|
| `/setup` | Register a GitHub repo |
| `/discover` | Auto-discover repos |
| `/search` | Search commits |
| `/compare` | Compare refs |
| `/config` | Bot settings (language, chart, roles) |
