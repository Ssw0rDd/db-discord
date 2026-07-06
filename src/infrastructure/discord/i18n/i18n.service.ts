import { injectable } from 'tsyringe';
import { ptBR, type LocaleKey } from './locales/pt-BR.js';
import { enUS } from './locales/en-US.js';
import { es } from './locales/es.js';

export const DEFAULT_LOCALE = 'en-US';

const LOCALES: Record<string, Record<LocaleKey, string>> = {
  'pt-BR': ptBR,
  'en-US': enUS,
  es,
};

@injectable()
export class I18nService {
  t(locale: string, key: LocaleKey): string {
    return LOCALES[locale]?.[key] ?? enUS[key] ?? ptBR[key] ?? key;
  }

  normalize(locale: string): string {
    if (LOCALES[locale]) return locale;
    if (locale.startsWith('pt')) return 'pt-BR';
    if (locale.startsWith('es')) return 'es';
    if (locale.startsWith('en')) return 'en-US';
    return DEFAULT_LOCALE;
  }
}

export type { LocaleKey };
