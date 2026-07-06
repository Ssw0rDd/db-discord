/** Loads and validates environment variables from .env — see .env.example */
import { z } from 'zod';

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(3000),
  host: z.string().default('0.0.0.0'),
  webhookPath: z.string().default('/webhooks/github'),
  logLevel: z.string().default('info'),
  metricsEnabled: z.coerce.boolean().default(true),

  discord: z.object({
    token: z.string().min(1, 'DISCORD_TOKEN is required'),
    clientId: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
    guildId: z.string().optional(),
    backupCategoryName: z.string().default('Backups'),
  }),

  github: z.object({
    webhookSecret: z.string().optional(),
    pat: z.string().optional(),
    appId: z.string().optional(),
    privateKey: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    owner: z.string().optional(),
    autoDiscover: z.coerce.boolean().default(true),
    initialSyncCommits: z.coerce.number().default(30),
    includeForks: z.coerce.boolean().default(false),
  }),

  database: z.object({
    url: z.string().default('file:./data/db.sqlite'),
  }),

  cache: z.object({
    mode: z.enum(['memory', 'redis']).default('memory'),
    redisUrl: z.string().default('redis://127.0.0.1:6379'),
  }),

  queue: z.object({
    mode: z.enum(['memory', 'redis']).default('memory'),
    redisUrl: z.string().default('redis://127.0.0.1:6379'),
  }),

  backup: z.object({
    tempDir: z.string().default('./tmp/backups'),
    cacheTtlSeconds: z.coerce.number().default(3600),
    maxZipSizeMb: z.coerce.number().default(25),
    gitCloneDepth: z.coerce.number().default(1),
  }),

  security: z.object({
    adminUserIds: z.array(z.string()).default([]),
    rateLimitMax: z.coerce.number().default(30),
    rateLimitWindowMs: z.coerce.number().default(60000),
    defaultLanguage: z.enum(['pt-BR', 'en-US', 'es']).default('en-US'),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(): AppConfig {
  const adminIds = process.env.ADMIN_USER_IDS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  return configSchema.parse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    host: process.env.HOST,
    webhookPath: process.env.WEBHOOK_PATH,
    logLevel: process.env.LOG_LEVEL,
    metricsEnabled: process.env.METRICS_ENABLED,

    discord: {
      token: process.env.DISCORD_TOKEN,
      clientId: process.env.DISCORD_CLIENT_ID,
      guildId: process.env.DISCORD_GUILD_ID,
      backupCategoryName: process.env.DISCORD_BACKUP_CATEGORY_NAME,
    },

    github: {
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
      pat: process.env.GITHUB_PAT,
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      owner: process.env.GITHUB_OWNER,
      autoDiscover: process.env.GITHUB_AUTO_DISCOVER,
      initialSyncCommits: process.env.GITHUB_INITIAL_SYNC_COMMITS,
      includeForks: process.env.GITHUB_INCLUDE_FORKS,
    },

    database: {
      url: process.env.DATABASE_URL,
    },

    cache: {
      mode: process.env.CACHE_MODE,
      redisUrl: process.env.REDIS_URL,
    },

    queue: {
      mode: process.env.QUEUE_MODE,
      redisUrl: process.env.REDIS_URL,
    },

    backup: {
      tempDir: process.env.BACKUP_TEMP_DIR,
      cacheTtlSeconds: process.env.BACKUP_CACHE_TTL_SECONDS,
      maxZipSizeMb: process.env.MAX_ZIP_SIZE_MB,
      gitCloneDepth: process.env.GIT_CLONE_DEPTH,
    },

    security: {
      adminUserIds: adminIds,
      rateLimitMax: process.env.RATE_LIMIT_MAX,
      rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
      defaultLanguage: process.env.DEFAULT_LANGUAGE,
    },
  });
}
