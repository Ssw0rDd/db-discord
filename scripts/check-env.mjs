import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const pkRaw = process.env.GITHUB_PRIVATE_KEY ?? '';
const pkParsed = pkRaw.replace(/\\n/g, '\n');

const checks = {
  discord: {
    token: !!process.env.DISCORD_TOKEN,
    clientId: !!process.env.DISCORD_CLIENT_ID,
    guildId: !!process.env.DISCORD_GUILD_ID,
  },
  github: {
    pat: !!process.env.GITHUB_PAT,
    appId: !!process.env.GITHUB_APP_ID,
    clientId: !!process.env.GITHUB_CLIENT_ID,
    clientSecret: !!process.env.GITHUB_CLIENT_SECRET,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ? 'preenchido' : 'vazio (ok por enquanto)',
    privateKey: {
      present: !!pkRaw,
      startsCorrect: pkParsed.startsWith('-----BEGIN RSA PRIVATE KEY-----'),
      endsCorrect: pkParsed.trimEnd().endsWith('-----END RSA PRIVATE KEY-----'),
      hasRealNewlines: pkParsed.includes('\n') && !pkParsed.includes('\\n'),
      lineCount: pkParsed.split('\n').length,
    },
  },
  termux: {
    databaseUrl: process.env.DATABASE_URL,
    cacheMode: process.env.CACHE_MODE,
    queueMode: process.env.QUEUE_MODE,
    nodeEnv: process.env.NODE_ENV,
  },
};

const missing = [];
if (!checks.discord.token) missing.push('DISCORD_TOKEN');
if (!checks.discord.clientId) missing.push('DISCORD_CLIENT_ID');
if (!checks.github.pat) missing.push('GITHUB_PAT');

checks.missing = missing;
checks.readyToRun = missing.length === 0 && checks.github.privateKey.startsCorrect && checks.github.privateKey.endsCorrect;

console.log(JSON.stringify(checks, null, 2));
process.exit(checks.readyToRun ? 0 : 1);
