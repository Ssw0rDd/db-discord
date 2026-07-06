import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { injectable } from 'tsyringe';

export type EmojiValue = string | { id: string; name: string };
export type EmojiMap = Record<string, EmojiValue>;

@injectable()
export class EmojiConfigService {
  private path = resolve(process.cwd(), 'config/emojis.json');
  private cache: EmojiMap | null = null;

  reload(): void {
    if (!existsSync(this.path)) {
      this.cache = {};
      return;
    }
    this.cache = JSON.parse(readFileSync(this.path, 'utf-8')) as EmojiMap;
  }

  get emojis(): EmojiMap {
    if (!this.cache) this.reload();
    return this.cache ?? {};
  }

  /** Retorna emoji unicode ou objeto { id, name } para botões Discord */
  resolve(key: string, fallback = '•'): EmojiValue {
    const value = this.emojis[key];
    if (value === undefined || value === null) return fallback;
    return value;
  }

  /** Para TextDisplay markdown */
  text(key: string, fallback = ''): string {
    const value = this.resolve(key, fallback);
    return typeof value === 'string' ? value : `:${value.name}:`;
  }
}
