export type LoggerTransport = (lvl: LogLevel, data: Data, meta: Data) => void;
// deno-lint-ignore no-explicit-any
type Data = Record<string, any>;
type Action = () => Promise<void>;

/**
 * Interface for the Logger.
 */
export type Logger = {
  /** Current metadata associated with the logger instance. */
  readonly meta: Data;

  emergency: (data: Data) => void;
  alert: (data: Data) => void;
  error: (data: Data) => void;
  warning: (data: Data) => void;
  info: (data: Data) => void;
  debug1: (data: Data) => void;
  debug2: (data: Data) => void;
  debug3: (data: Data) => void;

  /**
   * Log data with a specific level.
   */
  log(lvl: LogLevel, data: Data): void;

  /**
   * Update the metadata for this logger instance.
   * Merges the provided metadata with existing metadata.
   */
  upd_meta(meta: Data): void;

  /**
   * Append a stack/code trace to the logger.
   * Useful for tracing execution path in logs.
   */
  stack(stack: string): void;

  /**
   * Execute an async action safely, logging any errors that occur.
   */
  dispatch: (lvl: LogLevel, action: Action) => void;

  /**
   * Schedule an async action to run after a delay.
   */
  timeout: (lvl: LogLevel, ms: number, action: Action) => void;

  /**
   * Schedule an async action to run repeatedly.
   */
  interval: (lvl: LogLevel, period: number, action: Action) => void;

  /**
   * Create a shallow copy of the logger.
   */
  clone: () => Logger;

  /**
   * Run a callback with a new logger instance context.
   * Uses AsyncLocalStorage to isolate the logger context.
   */
  cast<T>(cb: (logger: Logger) => T): T;
};

/**
 * Enumeration of log levels.
 */
export enum LogLevel {
  emergency,
  alert,
  error,
  warning,
  info,
  debug1,
  debug2,
  debug3,
}

export const LogLevelNameMap: Map<LogLevel, string> = new Map<LogLevel, string>([
  [LogLevel.emergency, 'emergency'],
  [LogLevel.alert, 'alert'],
  [LogLevel.error, 'error'],
  [LogLevel.warning, 'warning'],
  [LogLevel.info, 'info'],
  [LogLevel.debug1, 'debug1'],
  [LogLevel.debug2, 'debug2'],
  [LogLevel.debug3, 'debug3'],
]);
