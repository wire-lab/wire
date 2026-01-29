/**
 * Callback type for handling log messages.
 *
 * @param lvl - The severity level of the log.
 * @param data - The log data (message, code, etc.).
 * @param meta - Contextual metadata associated with the log.
 */
export type LoggerTransport = (lvl: LogLevel, data: Data, meta: Data) => void;

/**
 * Generic key-value store for log data and metadata.
 */
// deno-lint-ignore no-explicit-any
export type Data = Record<string, any>;

/**
 * Async action to be executed safely with error logging.
 */
export type Action = () => Promise<void>;

/**
 * Interface for the Logger.
 */
export type Logger = {
  /** Current metadata associated with the logger instance. */
  readonly meta: Data;

  /** Log at emergency level (0). */
  emergency: (data: Data) => void;
  /** Log at alert level (1). */
  alert: (data: Data) => void;
  /** Log at error level (2). */
  error: (data: Data) => void;
  /** Log at warning level (3). */
  warning: (data: Data) => void;
  /** Log at info level (4). */
  info: (data: Data) => void;
  /** Log at debug1 level (5). */
  debug1: (data: Data) => void;
  /** Log at debug2 level (6). */
  debug2: (data: Data) => void;
  /** Log at debug3 level (7). */
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
  /** Emergency: system is unusable (0) */
  emergency,
  /** Alert: action must be taken immediately (1) */
  alert,
  /** Error: critical conditions (2) */
  error,
  /** Warning: warning conditions (3) */
  warning,
  /** Info: informational messages (4) */
  info,
  /** Debug1: coarse-grained debug messages (5) */
  debug1,
  /** Debug2: fine-grained debug messages (6) */
  debug2,
  /** Debug3: finest-grained debug messages (7) */
  debug3,
}

/**
 * Map connecting LogLevel enum values to their string representations.
 */
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
