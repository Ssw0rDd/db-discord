import { injectable, inject } from 'tsyringe';
import { Octokit } from '@octokit/rest';
import { writeFile, stat } from 'node:fs/promises';
import type { AppConfig } from '../../config/index.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import type { IGitHubService } from '../../domain/repositories/index.js';
import type { CommitEntity } from '../../domain/entities/index.js';

export interface FileDownloadResult {
  buffer: Buffer;
  filename: string;
  size: number;
}

export interface FileTooLargeResult {
  tooLarge: true;
  url: string;
  size: number;
}

@injectable()
export class GitHubService implements IGitHubService {
  private octokit: Octokit;
  private pat: string | undefined;

  constructor(
    @inject(TOKENS.Config) config: AppConfig,
    @inject(TOKENS.Logger) private logger: ILogger,
  ) {
    this.pat = config.github.pat;
    this.octokit = new Octokit({
      auth: config.github.pat,
      userAgent: 'Db-Discord/1.0',
    });
  }

  async getRepository(owner: string, repo: string) {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return {
      id: data.id,
      fullName: data.full_name,
      defaultBranch: data.default_branch,
    };
  }

  async listRepositories(owner?: string) {
    if (!owner) {
      return this.paginateRepos(async (page) => {
        const { data } = await this.octokit.repos.listForAuthenticatedUser({
          per_page: 100,
          page,
          sort: 'updated',
          affiliation: 'owner,organization_member,collaborator',
        });
        return data;
      }, 'authenticated');
    }

    try {
      await this.octokit.orgs.get({ org: owner });
      return this.paginateRepos(async (page) => {
        const { data } = await this.octokit.repos.listForOrg({ org: owner, per_page: 100, page, type: 'all' });
        return data;
      }, owner);
    } catch {
      return this.paginateRepos(async (page) => {
        const { data } = await this.octokit.repos.listForUser({ username: owner, per_page: 100, page, type: 'all' });
        return data;
      }, owner);
    }
  }

  private async paginateRepos(
    fetchPage: (page: number) => Promise<Array<Record<string, unknown>>>,
    label: string,
  ) {
    const repos = [];
    let page = 1;
    while (true) {
      const data = await fetchPage(page);
      if (!data.length) break;
      for (const item of data) {
        repos.push(
          this.mapRepo({
            id: item.id as number,
            name: item.name as string,
            full_name: item.full_name as string,
            owner: { login: (item.owner as { login: string }).login },
            default_branch: (item.default_branch as string) ?? 'main',
            fork: item.fork as boolean,
            archived: item.archived as boolean | undefined,
            private: item.private as boolean,
          }),
        );
      }
      if (data.length < 100) break;
      page++;
    }
    this.logger.info({ count: repos.length, owner: label }, 'Repositórios listados');
    return repos;
  }

  private mapRepo(r: {
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
    default_branch: string;
    fork: boolean;
    archived?: boolean;
    private: boolean;
  }) {
    return {
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner.login,
      defaultBranch: r.default_branch,
      fork: r.fork,
      archived: r.archived ?? false,
      private: r.private,
    };
  }

  async listCommits(owner: string, repo: string, branch?: string, since?: string, limit = 30): Promise<CommitEntity[]> {
    const commits: CommitEntity[] = [];
    let page = 1;

    while (commits.length < limit) {
      const perPage = Math.min(100, limit - commits.length);
      let data;
      try {
        ({ data } = await this.octokit.repos.listCommits({
          owner,
          repo,
          sha: branch,
          since,
          per_page: perPage,
          page,
        }));
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 409) {
          this.logger.warn({ owner, repo }, 'Repositório vazio — nenhum commit para sincronizar');
          return [];
        }
        throw err;
      }

      if (!data.length) break;

      for (const c of data) {
        commits.push({
          projectId: '',
          sha: c.sha,
          shortSha: c.sha.slice(0, 7),
          message: c.commit.message,
          authorName: c.commit.author?.name ?? 'Unknown',
          authorEmail: c.commit.author?.email ?? '',
          authorDate: new Date(c.commit.author?.date ?? Date.now()),
          branch: branch ?? 'main',
          stats: { filesChanged: 0, additions: 0, deletions: 0 },
        });
      }

      if (data.length < perPage) break;
      page++;
    }

    return commits;
  }

  async getCommit(owner: string, repo: string, sha: string) {
    const { data } = await this.octokit.repos.getCommit({ owner, repo, ref: sha });
    return {
      projectId: '',
      sha: data.sha,
      shortSha: data.sha.slice(0, 7),
      message: data.commit.message,
      authorName: data.commit.author?.name ?? data.author?.login ?? 'Unknown',
      authorEmail: data.commit.author?.email ?? '',
      authorDate: new Date(data.commit.author?.date ?? Date.now()),
      branch: 'unknown',
      stats: {
        filesChanged: data.files?.length ?? 0,
        additions: data.stats?.additions ?? 0,
        deletions: data.stats?.deletions ?? 0,
      },
      files: data.files?.map((f) => f.filename) ?? [],
    };
  }

  async compareRefs(owner: string, repo: string, base: string, head: string) {
    const { data } = await this.octokit.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${base}...${head}`,
    });

    const filesAdded: string[] = [];
    const filesRemoved: string[] = [];
    const filesModified: string[] = [];

    for (const file of data.files ?? []) {
      if (file.status === 'added') filesAdded.push(file.filename);
      else if (file.status === 'removed') filesRemoved.push(file.filename);
      else filesModified.push(file.filename);
    }

    return {
      filesAdded,
      filesRemoved,
      filesModified,
      stats: {
        filesChanged: data.files?.length ?? 0,
        additions: data.files?.reduce((s, f) => s + (f.additions ?? 0), 0) ?? 0,
        deletions: data.files?.reduce((s, f) => s + (f.deletions ?? 0), 0) ?? 0,
      },
      patch: data.files?.slice(0, 5).map((f) => f.patch).filter(Boolean).join('\n'),
    };
  }

  async createWebhook(owner: string, repo: string, url: string, secret: string) {
    const { data } = await this.octokit.repos.createWebhook({
      owner,
      repo,
      config: { url, content_type: 'json', secret, insecure_ssl: '0' },
      events: ['push', 'release', 'create', 'pull_request'],
      active: true,
    });
    this.logger.info({ webhookId: data.id, repo: `${owner}/${repo}` }, 'GitHub webhook created');
    return { id: data.id };
  }

  getArchiveUrl(owner: string, repo: string, ref: string): string {
    return `https://github.com/${owner}/${repo}/archive/${ref}.zip`;
  }

  /** Baixa zipball do GitHub (funciona com SHA, branch ou tag) */
  async downloadZipball(
    owner: string,
    repo: string,
    ref: string,
    outputPath: string,
  ): Promise<{ sizeBytes: number; filePath: string }> {
    const url = `https://api.github.com/repos/${owner}/${repo}/zipball/${ref}`;
    const res = await fetch(url, {
      headers: {
        ...(this.pat ? { Authorization: `Bearer ${this.pat}` } : {}),
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Falha ao baixar ZIP (${res.status}): ${text.slice(0, 120)}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(outputPath, buffer);
    const info = await stat(outputPath);
    this.logger.info({ owner, repo, ref, sizeBytes: info.size }, 'ZIP baixado do GitHub');
    return { sizeBytes: info.size, filePath: outputPath };
  }

  /** Baixa conteúdo de um arquivo em um commit específico */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string,
    maxBytes = 25 * 1024 * 1024,
  ): Promise<FileDownloadResult | FileTooLargeResult> {
    const { data } = await this.octokit.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error('Caminho não é um arquivo');
    }

    if (data.size > maxBytes) {
      return { tooLarge: true, url: data.html_url ?? this.getArchiveUrl(owner, repo, ref), size: data.size };
    }

    if (data.content) {
      return {
        buffer: Buffer.from(data.content, 'base64'),
        filename: path.split('/').pop() ?? 'file',
        size: data.size,
      };
    }

    const downloadUrl = data.download_url;
    if (!downloadUrl) throw new Error('URL de download indisponível');

    const res = await fetch(downloadUrl, {
      headers: this.pat ? { Authorization: `Bearer ${this.pat}` } : {},
    });
    if (!res.ok) throw new Error(`Falha ao baixar arquivo (${res.status})`);

    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      buffer,
      filename: path.split('/').pop() ?? 'file',
      size: buffer.length,
    };
  }

  async getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    const { data } = await this.octokit.repos.listLanguages({ owner, repo });
    return data;
  }

  async listBranches(owner: string, repo: string): Promise<string[]> {
    const { data } = await this.octokit.repos.listBranches({ owner, repo, per_page: 30 });
    return data.map((b) => b.name);
  }

  async listReleases(owner: string, repo: string): Promise<{ tag: string; name: string; date: string }[]> {
    const { data } = await this.octokit.repos.listReleases({ owner, repo, per_page: 15 });
    return data.map((r) => ({
      tag: r.tag_name,
      name: r.name ?? r.tag_name,
      date: r.published_at ?? r.created_at ?? '',
    }));
  }

  async getLatestCommitSha(owner: string, repo: string, branch: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getCommit({ owner, repo, ref: branch });
      return data.sha;
    } catch {
      return null;
    }
  }

  async pushFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    content: Buffer,
    branch: string,
  ): Promise<{ sha: string }> {
    let existingSha: string | undefined;
    try {
      const { data } = await this.octokit.repos.getContent({ owner, repo, path, ref: branch });
      if (!Array.isArray(data) && data.type === 'file') existingSha = data.sha;
    } catch {
      /* arquivo novo */
    }

    const { data } = await this.octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: content.toString('base64'),
      branch,
      sha: existingSha,
    });

    return { sha: data.commit.sha! };
  }

  async getCommitDiffFiles(owner: string, repo: string, sha: string) {
    const { data } = await this.octokit.repos.getCommit({ owner, repo, ref: sha });
    return (data.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status ?? 'modified',
      additions: f.additions ?? 0,
      deletions: f.deletions ?? 0,
      patch: f.patch ?? '',
    }));
  }

  parseRepoFullName(fullName: string): { owner: string; repo: string } {
    const [owner, repo] = fullName.split('/');
    return { owner: owner!, repo: repo! };
  }
}
