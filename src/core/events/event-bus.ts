import type { Logger } from 'pino';

export type DomainEventHandler<T = unknown> = (payload: T) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, Set<DomainEventHandler>>();

  on<T = unknown>(event: string, handler: DomainEventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as DomainEventHandler);
    return () => this.handlers.get(event)?.delete(handler as DomainEventHandler);
  }

  async emit<T = unknown>(event: string, payload: T): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers?.size) return;
    await Promise.all([...handlers].map((h) => h(payload)));
  }
}

export const DOMAIN_EVENTS = {
  SYSTEM_STARTED: 'system.started',
  REPO_DETECTED: 'repo.detected',
  COMMIT_RECEIVED: 'commit.received',
  RELEASE_PUBLISHED: 'release.published',
  BRANCH_CREATED: 'branch.created',
  BACKUP_REQUESTED: 'backup.requested',
  BACKUP_COMPLETED: 'backup.completed',
  RESTORE_REQUESTED: 'restore.requested',
  PROJECT_CREATED: 'project.created',
} as const;

export type DomainEventName = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

export interface ILogger {
  info(obj: object, msg?: string): void;
  info(msg: string): void;
  warn(obj: object, msg?: string): void;
  warn(msg: string): void;
  error(obj: object, msg?: string): void;
  error(msg: string): void;
  debug(obj: object, msg?: string): void;
  child(bindings: object): ILogger;
}

export function adaptPinoLogger(logger: Logger): ILogger {
  return {
    info: (objOrMsg: object | string, msg?: string) => {
      if (typeof objOrMsg === 'string') logger.info(objOrMsg);
      else logger.info(objOrMsg, msg);
    },
    warn: (objOrMsg: object | string, msg?: string) => {
      if (typeof objOrMsg === 'string') logger.warn(objOrMsg);
      else logger.warn(objOrMsg, msg);
    },
    error: (objOrMsg: object | string, msg?: string) => {
      if (typeof objOrMsg === 'string') logger.error(objOrMsg);
      else logger.error(objOrMsg, msg);
    },
    debug: (objOrMsg: object | string, msg?: string) => {
      if (typeof objOrMsg === 'string') logger.debug(objOrMsg);
      else logger.debug(objOrMsg, msg);
    },
    child: (bindings) => adaptPinoLogger(logger.child(bindings)),
  };
}
