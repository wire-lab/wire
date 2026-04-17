/**
 * Represents a middleware function in a pipeline.
 * @template T The type of the context.
 * @template R The type of the result.
 * @param ctx The context object.
 * @param next The next middleware function in the pipeline.
 * @returns The result of the middleware function.
 */
export type PipeMiddleware<T, R> = (ctx: T, next: (ctx: T) => R) => R;

const noop = () => {};

/**
 * Creates a pipeline of middleware functions.
 * @template T The type of the context.
 * @template R The type of the result.
 * @param list The list of middleware functions.
 * @returns A function that executes the pipeline of middleware functions.
 * @example Basic Usage
 * ```ts ignore
 * const middleware1: PipeMiddleware<string, string> = (ctx, next) => {
 *   console.log('middleware1', ctx);
 *   return next(ctx + '1');
 * };
 *
 * const middleware2: PipeMiddleware<string, string> = (ctx, next) => {
 *   console.log('middleware2', ctx);
 *   return next(ctx + '2');
 * };
 *
 * const pipeline = pipe([middleware1, middleware2]);
 * const result = pipeline('start');
 * console.log(result); // Output: 'start12'
 * ```
 */
export const pipe = <T = unknown, R = unknown>(list: PipeMiddleware<T, R>[]): (ctx: T) => R => {
  return list.reduceRight((next, current) => {
    return function pipe(ctx: T) {
      return current(ctx, next);
    };
  }, noop as any);
};
