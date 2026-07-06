import pino from 'pino';
import type { ILogger } from '../events/event-bus.js';
import { adaptPinoLogger } from '../events/event-bus.js';

export function createLogger(level: string): ILogger {
  const logger = pino({
    level,
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });
  return adaptPinoLogger(logger);
}
