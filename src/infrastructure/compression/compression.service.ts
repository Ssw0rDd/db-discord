import { injectable, inject } from 'tsyringe';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { simpleGit } from 'simple-git';
import type { AppConfig } from '../../config/index.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILogger } from '../../core/events/event-bus.js';
import type { ICompressionService } from '../../domain/repositories/index.js';

const require = createRequire(import.meta.url);
// archiver is CJS — typed via minimal factory signature
const createArchive = require('archiver') as (
  format: string,
  options?: { zlib?: { level?: number } },
) => {
  pipe: (dest: NodeJS.WritableStream) => void;
  directory: (src: string, dest: boolean) => void;
  finalize: () => void;
  on: (event: string, cb: (err?: Error) => void) => void;
};

@injectable()
export class CompressionService implements ICompressionService {
  constructor(
    @inject(TOKENS.Config) private config: AppConfig,
    @inject(TOKENS.Logger) private logger: ILogger,
  ) {}

  async createZipFromGit(repoUrl: string, ref: string, outputPath: string) {
    const workDir = join(this.config.backup.tempDir, `work-${Date.now()}`);
    await mkdir(workDir, { recursive: true });
    await mkdir(join(outputPath, '..'), { recursive: true });

    try {
      const git = simpleGit();
      await git.clone(repoUrl, workDir, [
        '--depth',
        String(this.config.backup.gitCloneDepth),
        '--single-branch',
      ]);
      await simpleGit(workDir).checkout(ref);

      const sizeBytes = await this.zipDirectory(workDir, outputPath);
      this.logger.info({ ref, sizeBytes, outputPath }, 'ZIP created');
      return { sizeBytes, filePath: outputPath };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private zipDirectory(sourceDir: string, outputPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = createArchive('zip', { zlib: { level: 6 } });

      output.on('close', async () => {
        const info = await stat(outputPath);
        resolve(info.size);
      });

      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(sourceDir, false);
      void archive.finalize();
    });
  }

  async cleanup(path: string): Promise<void> {
    await rm(path, { force: true }).catch(() => undefined);
  }
}
