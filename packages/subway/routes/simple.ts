/**
 * @module
 * {@linkcode SimpleRoute} — a minimal {@linkcode SubwayRoute} with a composable middleware pipeline.
 */

import type { SubwayRoute } from '../subway.ts';
import { pipe } from '../support/pipe.ts';

export type { SubwayRoute } from '../subway.ts';

/**
 * Middleware for {@linkcode SimpleRoute}: receives input and `next`, may run logic before/after `next`.
 * @template I Same input type as the route handler.
 * @template O Same output type as the route handler.
 */
export type SimpleRouteMiddleware<I, O> = (input: I, next: (input: I) => O) => O;

/**
 * Default route implementation: lazy `execute` builds a pipeline from registered middleware and the handler.
 * @template I Context or input passed to the handler.
 * @template O Return type of the handler.
 */
export class SimpleRoute<I, O> implements SubwayRoute<I, O> {
  private middlewares: SimpleRouteMiddleware<I, O>[] = [];

  /**
   * Creates a route; the handler may be supplied later.
   * @param handler Optional initial handler; may be set later via {@linkcode SimpleRoute.set_handler}.
   */
  constructor(private handler?: (sig: I) => O) {}

  /** Composed handler: runs middleware outer-to-inner, then the configured handler. */
  get execute(): (input: I) => O {
    let handler = this.handler;

    if (this.middlewares.length !== 0) {
      // @ts-ignore: TS2345
      handler = pipe([...this.middlewares.reverse(), handler]);
    }

    if (handler === undefined) throw new Error('Route handler is not set');

    Reflect.defineProperty(this, 'execute', { value: handler });

    return handler;
  }

  /** Replaces the route’s handler function. */
  set_handler(handler: (sig: I) => O): void {
    this.handler = handler;
  }

  /** Appends middleware executed before the handler in the pipeline. */
  use(middleware: SimpleRouteMiddleware<I, O>): void {
    this.middlewares.push(middleware);
  }
}
