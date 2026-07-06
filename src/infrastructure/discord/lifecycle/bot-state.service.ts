import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { injectable } from 'tsyringe';

export interface BotStateFile {
  running: boolean;
  lastStart: string | null;
  lastStop: string | null;
  pid: number | null;
}

@injectable()
export class BotStateService {
  private path = resolve(process.cwd(), 'data/bot.state.json');

  private async read(): Promise<BotStateFile | null> {
    try {
      const raw = await readFile(this.path, 'utf-8');
      return JSON.parse(raw) as BotStateFile;
    } catch {
      return null;
    }
  }

  private async write(state: BotStateFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(state, null, 2), 'utf-8');
  }

  /** Marca bot online; retorna true se o último ciclo terminou sem shutdown graceful */
  async markStarting(): Promise<{ recoveredFromCrash: boolean }> {
    const prev = await this.read();
    const recoveredFromCrash = prev?.running === true;
    await this.write({
      running: true,
      lastStart: new Date().toISOString(),
      lastStop: prev?.lastStop ?? null,
      pid: process.pid,
    });
    return { recoveredFromCrash };
  }

  async markStopping(): Promise<void> {
    const prev = await this.read();
    await this.write({
      running: false,
      lastStart: prev?.lastStart ?? null,
      lastStop: new Date().toISOString(),
      pid: process.pid,
    });
  }
}
