# Hospedagem — VPS (Linux)

## 1. Clonar

```bash
git clone <url> /opt/db-discord
cd /opt/db-discord
cp .env.example .env
nano .env
```

## 2. Dependências

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
npm install
npm run db:push
npm run build
```

## 3. Redis (opcional, produção)

```bash
sudo apt install redis-server
```

No `.env`:

```
CACHE_MODE=redis
QUEUE_MODE=redis
REDIS_URL=redis://127.0.0.1:6379
NODE_ENV=production
METRICS_ENABLED=true
```

## 4. PM2

```bash
sudo npm install -g pm2
mkdir -p logs data tmp/backups
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## 5. Webhook público

Nginx reverse proxy na porta 3000 ou Cloudflare Tunnel apontando para `localhost:3000`.

Webhook GitHub: `https://seu-dominio/webhooks/github`

## 6. Permissões Discord

O bot precisa:

- Manage Channels, Manage Threads
- Send Messages, Embed Links, Attach Files
- Manage Messages (apagar anexo após upload)
- Read Message History, Message Content Intent (já no código)

## 7. Comandos úteis

```bash
pm2 logs db-discord
pm2 restart db-discord
```
