# Db-Discord — Español

Bot de backup y versionado GitHub para Discord.

## Requisitos

- Node.js 20+
- Token de bot Discord
- GitHub PAT con `repo` y `contents:write`
- SQLite (incluido)

## Instalación

```bash
git clone <url-repo> db-discord
cd db-discord
cp .env.example .env
npm install
npm run db:push
npm run db:generate
npm run build
npm start
```

## Configurar `.env`

| Variable | Obligatorio | Descripción |
|----------|-------------|-------------|
| `DISCORD_TOKEN` | Sí | Token del bot |
| `DISCORD_CLIENT_ID` | Sí | Application ID |
| `DISCORD_GUILD_ID` | Sí | ID del servidor |
| `GITHUB_PAT` | Sí | Token con `contents:write` |
| `ADMIN_USER_IDS` | Sí | Tu ID de Discord |
| `DATABASE_URL` | No | Default: `file:./data/db.sqlite` |
| `CACHE_MODE` | No | `memory` o `redis` |
| `QUEUE_MODE` | No | `memory` o `redis` |

### GitHub PAT

1. https://github.com/settings/tokens
2. Generate new token (classic)
3. Marcar: `repo`
4. Pegar en `GITHUB_PAT`

Sin `contents:write`, el upload en Workspace devuelve 403.

## Comandos

| Comando | Uso |
|---------|-----|
| `/setup owner:org repo:nombre` | Registrar repositorio |
| `/discover` | Descubrir repos |
| `/search query:término` | Buscar commits |
| `/config` | Idioma, gráfico, roles |

## Hospedaje

- [VPS](hosting/vps.md)
- [Termux](hosting/termux.md)
- [PC local](hosting/local.md)
