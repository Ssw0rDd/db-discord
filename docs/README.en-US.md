# Db-Discord — English

GitHub backup and versioning bot for Discord.

## Requirements

- Node.js 20+
- Discord Bot token
- GitHub PAT with `repo` and `contents:write`
- SQLite (bundled)

## Install

```bash
git clone <repo-url> db-discord
cd db-discord
cp .env.example .env
npm install
npm run db:push
npm run db:generate
npm run build
npm start
```

## Configure `.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Bot token |
| `DISCORD_CLIENT_ID` | Yes | Application ID |
| `DISCORD_GUILD_ID` | Yes | Server ID |
| `GITHUB_PAT` | Yes | Token with `contents:write` |
| `ADMIN_USER_IDS` | Yes | Your Discord user ID |
| `DATABASE_URL` | No | Default: `file:./data/db.sqlite` |
| `CACHE_MODE` | No | `memory` or `redis` |
| `QUEUE_MODE` | No | `memory` or `redis` |

### GitHub PAT

1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Enable: `repo` (includes contents:write)
4. Set `GITHUB_PAT`

Without `contents:write`, Workspace file upload returns 403.

## Commands

| Command | Usage |
|---------|-------|
| `/setup owner:org repo:name` | Register a repository |
| `/discover` | Auto-discover repos |
| `/search query:term` | Search commits |
| `/config` | Language, chart, roles |

## `/config` permissions

| Field | Effect |
|-------|--------|
| Admin roles | Manage bot and workspace |
| Interaction | Who can click buttons (empty = everyone) |
| View | Who can interact (empty = open) |
| Admin IDs | Extra IDs besides `ADMIN_USER_IDS` |

## GitHub webhook

URL: `https://your-domain/webhooks/github`

Use Cloudflare Tunnel or ngrok on mobile. See [hosting/termux.md](hosting/termux.md).

## Bot offline

On shutdown, panels and backup messages show **Bot offline** and buttons are removed until restart.

## Hosting

- [VPS](hosting/vps.md)
- [Termux](hosting/termux.md)
- [Local PC](hosting/local.md)
