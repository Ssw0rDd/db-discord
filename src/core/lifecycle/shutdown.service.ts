import type { ILogger } from '../events/event-bus.js';

export type ShutdownHandler = (signal: string) => Promise<void>;

const SHUTDOWN_TIMEOUT_MS = 30_000;

export class ShutdownService {
  private handler: ShutdownHandler | null = null;
  private shuttingDown = false;

  register(handler: ShutdownHandler, logger: ILogger): void {
    this.handler = handler;

    const run = (signal: string) => {
      void this.execute(signal, logger);
    };

    process.on('SIGINT', () => run('SIGINT'));
    process.on('SIGTERM', () => run('SIGTERM'));

    if (process.platform === 'win32') {
      process.on('SIGBREAK', () => run('SIGBREAK'));
    }

    process.on('uncaughtException', (err) => {
      logger.error({ err }, 'Uncaught exception — starting shutdown');
      void this.execute('uncaughtException', logger);
    });

    // Mantém stdin ativo para Ctrl+C funcionar em terminais Windows/PM2
    if (process.stdin.isTTY) {
      process.stdin.resume();
    }

    logger.info('SIGINT/SIGTERM handlers registered — press Ctrl+C for graceful offline sync');
  }

  private async execute(signal: string, logger: ILogger): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    logger.info({ signal }, 'Graceful shutdown started');

    const forceExit = setTimeout(() => {
      logger.error({ signal }, 'Shutdown timeout — forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      if (this.handler) {
        await this.handler(signal);
      }
      logger.info({ signal }, 'Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err, signal }, 'Error during shutdown');
      process.exit(1);
    } finally {
      clearTimeout(forceExit);
    }
  }
}

export const shutdownService = new ShutdownService();
