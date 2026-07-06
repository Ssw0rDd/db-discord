# Hospedagem — Termux (Android)

## 1. Pacotes

```bash
pkg update && pkg upgrade -y
pkg install git nodejs-lts openssh
npm install -g pm2
```

## 2. Clonar e configurar

```bash
git clone <url> ~/db-discord
cd ~/db-discord
cp .env.example .env
nano .env
```

Preencha token Discord, PAT GitHub, IDs admin.

Mantenha:

```
CACHE_MODE=memory
QUEUE_MODE=memory
METRICS_ENABLED=false
```

## 3. Banco e build

```bash
npm install
npm run db:push
npm run build
mkdir -p logs data tmp/backups
pm2 start ecosystem.config.cjs
pm2 save
```

## 4. Webhook no celular

GitHub precisa alcançar seu bot:

```bash
pkg install cloudflare-cloudflared
cloudflared tunnel --url http://127.0.0.1:3000
```

Use a URL HTTPS gerada + `/webhooks/github` no webhook do repo.

Alternativa: ngrok `ngrok http 3000`

## 5. Manter rodando

- Desative otimização de bateria para Termux
- Use `pm2 startup` se disponível no seu ambiente
- Evite fechar Termux durante backups

## 6. Upload de arquivos (Workspace)

1. Workspace → Enviar arquivo
2. Pasta vazia = raiz (main)
3. Anexe o arquivo no canal (nome vem do anexo)
4. PAT precisa `contents:write`
