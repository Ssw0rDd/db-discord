# Architecture Decision Records

## ADR-001: Language Selection — TypeScript (Node.js)

### Context
The system requires deep integration with Discord API (Components V2), GitHub API/Webhooks, async job queues, streaming file compression, and rich interactive UI.

### Comparison

| Criteria | TypeScript | Rust | Go | C# | Java |
|----------|-----------|------|-----|-----|------|
| Discord ecosystem | ★★★★★ discord.js | ★★★ serenity | ★★★ discordgo | ★★★ DSharpPlus | ★★ JDA |
| GitHub SDK | ★★★★★ Octokit | ★★★★ octocrab | ★★★★ go-github | ★★★★ Octokit.NET | ★★★★ Kohsuke |
| Dev velocity | ★★★★★ | ★★★ | ★★★★ | ★★★★ | ★★★ |
| I/O performance | ★★★★ | ★★★★★ | ★★★★★ | ★★★★ | ★★★★ |
| Memory | ★★★ | ★★★★★ | ★★★★★ | ★★★ | ★★★ |
| Streaming/ZIP | ★★★★ | ★★★★★ | ★★★★★ | ★★★★ | ★★★★ |
| Hiring/maintainability | ★★★★★ | ★★★ | ★★★★ | ★★★★ | ★★★★ |

### Decision
**TypeScript on Node.js LTS (≥22.12)** with discord.js 14.x, Fastify, Prisma, BullMQ.

### Rationale
1. **discord.js** is the most mature Discord library with first-class Components V2 support.
2. Workload is **I/O-bound** (webhooks, API calls, git clone, zip streaming) — Node.js event loop excels here.
3. **Octokit + BullMQ + Prisma** provide production-grade GitHub/queue/ORM integration.
4. Faster iteration for complex Discord UX (panels, modals, pagination).
5. Bun was evaluated but rejected for production: discord.js compatibility gaps and smaller ecosystem.

### Consequences
- Use worker processes for CPU-heavy zip/git operations.
- Monitor memory with streaming APIs (never buffer full repos in RAM).

---

## ADR-002: Database — SQLite (+ cache/fila em memória no Termux)

### Context
Deploy no Termux (celular + PM2) exige zero dependências externas: sem Docker, sem PostgreSQL, sem Redis obrigatório.

### Decision
- **SQLite** — banco em arquivo (`data/db.sqlite`), Prisma ORM
- **Memória** — cache e fila padrão (`CACHE_MODE=memory`, `QUEUE_MODE=memory`)
- **Redis** — opcional para servidores dedicados (`CACHE_MODE=redis`, `QUEUE_MODE=redis`)

### Rationale
SQLite é embutido, um único arquivo, backup fácil (copiar `data/db.sqlite`). Fila em memória evita instalar Redis no Termux e reduz RAM/CPU no celular.

### Consequences
- Jobs em memória são perdidos se o processo reiniciar (aceitável no mobile; sync fallback recupera)
- Busca case-sensitive no SQLite (sem `pg_trgm`)
- Para escala grande, migrar para PostgreSQL + Redis em VPS

---

## ADR-003: Architecture — Clean Architecture + Event-Driven

### Layers
```
presentation/  → Discord handlers, HTTP webhooks, admin dashboard
application/   → Use cases (commands/queries), DTOs
domain/        → Entities, value objects, domain events, repository interfaces
infrastructure/→ Prisma, Redis, GitHub, Discord, Git, compression
core/          → DI container, event bus, config, logging
```

### Patterns
- **CQRS-lite**: separate read (search/analytics) from write (sync/backup) paths
- **Event bus**: internal pub/sub for decoupled modules
- **DI**: tsyringe container with interface-based injection
- **Queue**: BullMQ for async webhook processing, zip generation, sync jobs

---

## ADR-004: GitHub Sync Strategy

1. **Primary**: GitHub Webhooks (push, release, create branch/tag)
2. **Fallback**: Intelligent sync — only when webhook missing, using ETag/conditional requests
3. **Never**: blind polling; scheduler runs per-repo with exponential backoff based on activity

---

## ADR-005: Discord Organization

```
📂 Backups (category)
  📄 #projeto-a (text channel)
    📌 Panel message (Components V2, pinned)
    🧵 v3.1.0 (thread per commit/tag)
    🧵 v3.0.2
```

Each commit creates a thread with action buttons: ZIP, Files, Diff, Restore, Share, Pin.

---

## ADR-006: ZIP On-Demand Strategy

No persistent ZIP storage. Flow:
1. User clicks 📥 ZIP
2. Job queued → shallow git clone/checkout → archiver stream → Discord attachment upload
3. Temp files deleted immediately
4. Optional Redis cache of last N downloads (hash → temp path, TTL 1h)

Discord attachment limit: 25MB (bot) / 500MB (Nitro server boost). Split or warn if exceeded.

---

## ADR-007: Security

- GitHub webhook HMAC-SHA256 verification
- Discord interaction signature verification (built into discord.js)
- Rate limiting per user (Redis sliding window)
- Project-level RBAC (VIEWER/CONTRIBUTOR/ADMIN)
- Structured audit logs
- Input sanitization via Zod schemas
- Admin allowlist via ADMIN_USER_IDS

---

## ADR-008: Observability

- **Logs**: Pino structured JSON
- **Metrics**: prom-client (HTTP, queue depth, sync latency)
- **Tracing**: OpenTelemetry-ready hooks (optional)
- **Health**: `/health` endpoint (DB + Redis + Discord gateway status)
