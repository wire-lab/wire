import type { SubwayRoute } from '../subway.ts';
import { pipe } from '../support/pipe.ts';

type SimpleMiddleware<I, O> = (input: I, next: (input: I) => O) => O;

export class SimpleRoute<I, O> implements SubwayRoute<I, O> {
  private middlewares: SimpleMiddleware<I, O>[] = [];
  constructor(private handler?: (sig: I) => O) {}

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

  set_handler(handler: (sig: I) => O): void {
    this.handler = handler;
  }

  use(middleware: SimpleMiddleware<I, O>): void {
    this.middlewares.push(middleware);
  }
}
