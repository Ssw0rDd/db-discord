import { injectable } from 'tsyringe';
import type { ModalSubmitInteraction } from 'discord.js';

export interface PushUploadSession {
  userId: string;
  projectId: string;
  folder: string;
  commitMsg: string;
  interaction: ModalSubmitInteraction;
  expiresAt: number;
  locale: string;
}

@injectable()
export class PushUploadSessionService {
  private pending = new Map<string, PushUploadSession>();

  register(session: PushUploadSession): void {
    this.pending.set(session.userId, session);
  }

  get(userId: string): PushUploadSession | undefined {
    const session = this.pending.get(userId);
    if (!session) return undefined;
    if (Date.now() > session.expiresAt) {
      this.pending.delete(userId);
      return undefined;
    }
    return session;
  }

  clear(userId: string): void {
    this.pending.delete(userId);
  }
}

export function resolveRepoPath(folder: string, filename: string): string {
  const file = filename.trim().replace(/^\/+/, '').replace(/\\/g, '/');
  if (!file || file.includes('..')) throw new Error('Invalid filename');

  const raw = folder.trim();
  const isRoot = !raw || ['raiz', 'main', 'root', '.', '/'].includes(raw.toLowerCase());
  if (isRoot) return file;

  const dir = raw.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
  if (!dir || dir.includes('..')) throw new Error('Invalid folder path');

  return `${dir}/${file}`;
}

export function formatGithubPushError(err: unknown): string {
  const e = err as { status?: number; message?: string; response?: { data?: { message?: string } } };
  const msg = e.response?.data?.message ?? e.message ?? '';
  if (e.status === 403 && msg.toLowerCase().includes('personal access token')) {
    return 'PAT_GITHUB_SEM_PERMISSAO';
  }
  if (e.status === 403) return 'GITHUB_403';
  if (e.status === 404) return 'GITHUB_404';
  return 'GENERIC';
}
