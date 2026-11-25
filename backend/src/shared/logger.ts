export interface Logger {
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

const silent = process.env.NODE_ENV === 'test';

export const logger: Logger = {
  info: (msg, meta) => !silent && console.info(msg, meta ?? ''),
  warn: (msg, meta) => !silent && console.warn(msg, meta ?? ''),
  error: (msg, meta) => !silent && console.error(msg, meta ?? ''),
};
