import { AsyncLocalStorage } from 'node:async_hooks';
import { LogLevelNameMap, type Logger as ILogger, type LoggerTransport, type LogLevel } from './definitions.ts';

// deno-lint-ignore no-explicit-any
type Rsa = Record<string, any>;

const asyncLocalStorage = new AsyncLocalStorage<ILogger>();

type Data = Rsa & {
  code?: string;
};

type Meta = Rsa;

/**
 * Get the current logger instance from the async context.
 * Falls back to the GlobalLogger if no context is active.
 */
export const use_logger = (): ILogger => asyncLocalStorage.getStore() ?? GlobalLogger;

/**
 * Clone the current logger.
 */
export const clone_logger = (): ILogger => use_logger().clone();

type Action = () => Promise<void>;

/**
 * Helper to run a callback within a new logger context.
 * Shorthand for use_logger().cast(cb).
 */
export const cast_logger = <T>(cb: (logger: ILogger) => T): T => use_logger().cast(cb);

type InitOpts = {
  transport: LoggerTransport;
  format_error: (e: Error | unknown) => unknown;
  level: LogLevel;
};

export type { ILogger as Logger };

let GlobalLogger: ILogger;

/**
 * Initialize the global logger instance.
 * Must be called before using use_logger() if outside of a cast() context.
 */
export const init_logger = (opts: InitOpts): void => {
  GlobalLogger = create_logger(opts);
};

/**
 * Create a new Logger instance.
 */
export const create_logger = ({ transport, format_error, level }: InitOpts): ILogger => {
  class Logger implements ILogger {
    constructor(
      protected send: LoggerTransport,
      public readonly meta: Meta,
      protected _stack?: string
    ) {}

    declare emergency: (data: Data) => void;
    declare alert: (data: Data) => void;
    declare error: (data: Data) => void;
    declare warning: (data: Data) => void;
    declare info: (data: Data) => void;
    declare debug1: (data: Data) => void;
    declare debug2: (data: Data) => void;
    declare debug3: (data: Data) => void;

    public static create(send: LoggerTransport) {
      return new Logger(send, {});
    }

    upd_meta(meta: Meta): void {
      Object.assign(this.meta, meta);
    }

    stack(stack: string): void {
      this._stack = this._stack === undefined ? stack : `${this._stack}.${stack}`;
    }

    cast<T>(callback: (logger: Logger) => T): T {
      const next = new Logger(this.send, { ...this.meta }, this._stack);
      return asyncLocalStorage.run(next, callback, next);
    }

    clone() {
      return new Logger(this.send, { ...this.meta }, this._stack);
    }

    log(lvl: LogLevel, data: Data): void {
      if (this._stack !== undefined) {
        if (data.code === undefined) {
          data.code = this._stack;
        } else {
          data.code = `${this._stack}.${data.code}`;
        }
      }

      this.send(lvl, data, this.meta);
    }

    dispatch(lvl: LogLevel, action: Action) {
      action().catch((e) => this.log(lvl, { code: 'dispatch_failed', error: format_error(e) }));
    }

    timeout(lvl: LogLevel, ms: number, action: Action) {
      try {
        setTimeout(() => this.dispatch(lvl, action), ms);
      } catch (error) {
        this.log(lvl, { code: 'timeout_failed', error });
      }
    }

    // interval but with immediate execution
    interval(lvl: LogLevel, period: number, action: Action) {
      const launch = () => {
        this.dispatch(lvl, action);
        setTimeout(launch, period);
      };
      launch();
    }
  }

  for (const [lvl, name] of LogLevelNameMap.entries()) {
    // Cast to any to avoid "meta" readonly error when iterating
    // This is safe because we are dynamically building the class prototype
    // deno-lint-ignore no-explicit-any
    (Logger.prototype as any)[name] =
      lvl <= level
        ? function (this: ILogger, data: Data) {
            this.log(lvl, data);
          }
        : function () {};
  }

  return new Logger(transport, {});
};
