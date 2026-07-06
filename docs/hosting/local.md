# Hospedagem — PC local (desenvolvimento)

## 1. Clonar

```bash
git clone <url> db-discord
cd db-discord
cp .env.example .env
```

Edite `.env` com token, client ID, guild ID, PAT, admin IDs.

## 2. Rodar

```bash
npm install
npm run db:push
npm run dev
```

`npm run dev` usa tsx watch — reinicia ao salvar arquivos.

## 3. Registrar comandos

Com `DISCORD_GUILD_ID` definido, comandos aparecem instantaneamente no servidor ao iniciar.

## 4. Webhook local

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Configure webhook GitHub com a URL pública.

## 5. Testar

1. `/setup owner:usuario repo:repo`
2. `/config` — idioma e permissões
3. Painel do projeto → Workspace → Enviar arquivo

## 6. Build produção

```bash
npm run build
npm start
```
