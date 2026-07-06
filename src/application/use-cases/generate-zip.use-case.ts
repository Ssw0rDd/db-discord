import { injectable, inject } from 'tsyringe';
import { join } from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import type { AppConfig } from '../../config/index.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import { EventBus, DOMAIN_EVENTS } from '../../core/events/event-bus.js';
import { ProjectRepository } from '../../infrastructure/database/repositories/project.repository.js';
import { GitHubService } from '../../infrastructure/github/github.service.js';
import { CompressionService } from '../../infrastructure/compression/compression.service.js';
import { DiscordChannelService } from '../../infrastructure/discord/discord-channel.service.js';
import type { ICacheService } from '../../domain/repositories/index.js';
import type { ZipJobData } from '../../domain/services/queue.interface.js';

@injectable()
export class GenerateZipUseCase {
  constructor(
    @inject(TOKENS.Config) private config: AppConfig,
    @inject(TOKENS.Logger) private logger: ILogger,
    @inject(EventBus) private eventBus: EventBus,
    @inject(ProjectRepository) private projects: ProjectRepository,
    @inject(GitHubService) private github: GitHubService,
    @inject(CompressionService) private compression: CompressionService,
    @inject(DiscordChannelService) private discord: DiscordChannelService,
    @inject(TOKENS.Cache) private cache: ICacheService,
  ) {}

  async execute(data: ZipJobData): Promise<void> {
    const cacheKey = `zip:${data.projectId}:${data.sha}`;
    const project = await this.projects.findById(data.projectId);
    if (!project) return;

    const { owner, repo } = this.github.parseRepoFullName(project.fullName);
    await mkdir(this.config.backup.tempDir, { recursive: true });

    const outputPath = join(this.config.backup.tempDir, `${project.name}-${data.sha.slice(0, 7)}.zip`);
    const maxBytes = this.config.backup.maxZipSizeMb * 1024 * 1024;
    const filename = `${project.name}-${data.sha.slice(0, 7)}.zip`;

    try {
      const cached = await this.cache.get<{ path: string }>(cacheKey);
      let filePath = cached?.path;

      if (!filePath) {
        const result = await this.github.downloadZipball(owner, repo, data.sha, outputPath);
        filePath = result.filePath;

        if (result.sizeBytes > maxBytes) {
          const link = this.github.getArchiveUrl(owner, repo, data.sha);
          await this.discord.sendChannelMessage(
            data.channelId,
            `⚠️ ZIP (${Math.round(result.sizeBytes / 1024 / 1024)}MB) excede o limite de ${this.config.backup.maxZipSizeMb}MB.\n` +
              `Baixe direto: ${link}`,
          );
          await this.compression.cleanup(outputPath);
          return;
        }

        await this.cache.set(cacheKey, { path: filePath }, this.config.backup.cacheTtlSeconds);
      } else {
        const info = await stat(filePath).catch(() => null);
        if (!info || info.size > maxBytes) {
          await this.cache.del(cacheKey);
          return this.execute(data);
        }
      }

      await this.discord.sendZipAttachment(data.channelId, filePath, filename);
      await this.eventBus.emit(DOMAIN_EVENTS.BACKUP_COMPLETED, { projectId: data.projectId, sha: data.sha });
    } catch (err) {
      this.logger.error({ err, project: project.fullName, sha: data.sha }, 'Falha ao gerar ZIP');
      const link = this.github.getArchiveUrl(owner, repo, data.sha);
      await this.discord.sendChannelMessage(
        data.channelId,
        `❌ Could not generate the ZIP automatically.\nTry downloading manually: ${link}`,
      ).catch(() => undefined);
    } finally {
      if (!(await this.cache.exists(cacheKey))) {
        await this.compression.cleanup(outputPath);
      }
    }
  }
}
