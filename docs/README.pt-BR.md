# Db-Discord — Português

Bot de backup e versionamento GitHub para Discord.

## Requisitos

- Node.js 20+
- Token Discord (Bot)
- GitHub PAT com escopo `repo` e `contents:write`
- SQLite (incluso)

## Instalação

```bash
git clone <url-do-repo> db-discord
cd db-discord
cp .env.example .env
npm install
npm run db:push
npm run db:generate
npm run build
npm start
```

## Configurar `.env`

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `DISCORD_TOKEN` | Sim | Token do bot |
| `DISCORD_CLIENT_ID` | Sim | Application ID |
| `DISCORD_GUILD_ID` | Sim | ID do servidor |
| `GITHUB_PAT` | Sim | Token com `contents:write` |
| `ADMIN_USER_IDS` | Sim | Seu ID Discord (vírgula) |
| `DATABASE_URL` | Não | Padrão: `file:./data/db.sqlite` |
| `CACHE_MODE` | Não | `memory` ou `redis` |
| `QUEUE_MODE` | Não | `memory` ou `redis` |

### GitHub PAT

1. Acesse https://github.com/settings/tokens
2. Generate new token (classic)
3. Marque: `repo` (inclui contents:write)
4. Cole em `GITHUB_PAT`

Sem `contents:write` o envio de arquivos (Workspace) retorna erro 403.

## Comandos

| Comando | Uso |
|---------|-----|
| `/setup owner:org repo:nome` | Registra um repositório |
| `/discover` | Descobre repos automaticamente |
| `/search query:termo` | Busca commits |
| `/config` | Idioma, gráfico, cargos |

## `/config` — permissões

| Campo | Efeito |
|-------|--------|
| Admin roles | Cargos que administram bot e workspace |
| Interação | Quem pode clicar nos botões (vazio = todos) |
| Visualização | Quem pode ver/interagir (vazio = aberto) |
| Admin IDs | IDs extras além de `ADMIN_USER_IDS` |

## Webhook GitHub

URL: `https://seu-dominio/webhooks/github`

Use Cloudflare Tunnel ou ngrok no celular. Veja [hosting/termux.md](hosting/termux.md).

## Bot offline

Ao desligar, o bot edita painéis e mensagens de backup indicando **Bot desligado** e remove botões até reiniciar.

## Hospedagem

- [VPS](hosting/vps.md)
- [Termux](hosting/termux.md)
- [PC local](hosting/local.md)
