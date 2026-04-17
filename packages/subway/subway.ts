/**
 * @module
 * Core {@linkcode Subway} router, grouping APIs, and route type contracts for custom route classes.
 */

import { LibError } from './error.ts';

/** Dot-separated route key (for example `user.friends.get`). */
export type SubwayAction = string;

type Registry<R extends SubwayRoute<any, any>> = Map<SubwayAction | undefined, R>;

/**
 * Minimal contract implemented by route classes used with {@linkcode Subway}.
 * @template I Handler input.
 * @template O Handler output.
 */
export type SubwayRoute<I, O> = {
  execute(input: I): O;
  set_handler(handler: (sig: I) => O): void;
};

/**
 * Handler signature inferred from a route type: input type `I` to output type `O`.
 * @template R Route class type.
 */
export type SubwayHandler<R extends SubwayRoute<any, any>> = R extends SubwayRoute<infer I, infer O>
  ? (sig: I) => O
  : never;

/**
 * Factory that receives a route instance and may return a handler or configure the route only.
 * @template R Route class type.
 */
export type SubwayFactory<R extends SubwayRoute<any, any>> = (route: R) => SubwayHandler<R> | void;

/** Middleware invoked for each route as it is registered. */
export type SubwayMiddleware<R extends SubwayRoute<any, any>> = (route: R) => void;

/** Any route type compatible with {@linkcode Subway}. */
export type SubwayAnyRoute = SubwayRoute<any, any>;

/**
 * API surface shared by the root router and nested {@linkcode SubwayGroup} scopes.
 * @template R Route class type.
 */
export type SubwayNode<R extends SubwayRoute<any, any>> = {
  cast(action: SubwayAction, factory: SubwayFactory<R>): R;
  add(action: SubwayAction, handler: SubwayHandler<R>): R;
  group(prefix: SubwayAction, callback: (group: SubwayGroup<R>) => void): void;
  use(middleware: SubwayMiddleware<R>): void;
  inject(prefix: SubwayAction, bundle: Bundle<R>): void;
};

type RC<R extends SubwayRoute<any, any>> = {
  new (handler?: SubwayHandler<R>): R;
};

/**
 * Represents a Subway router that manages routes and their handlers.
 * @template R The type of route.
 * @example
 * ```ts ignore
 * import { type SubwayNode, Subway } from 'jsr:@wire/subway';
 * import { SimpleRoute } from 'jsr:@wire/subway/routes/simple.ts';
 *
 * type Result = Promise<any>;
 * class Context {
 *   constructor(public readonly req: Request) {}
 * }
 * class Route extends SimpleRoute<Context, Result> {
 *   obtain_valid_json<T>(schema: { validate: (data: unknown) => Promise<T> }) {
 *     return async (ctx: Context) => schema.validate(await ctx.req.json());
 *   }
 * }
 *
 * const Router = new Subway(Route);
 *
 * const sample_route_middleware = (route: Route) => {
 *   route.use(async (ctx, next) => {
 *     console.log('before');
 *     const result = await next(ctx);
 *     console.log('after');
 *     return result;
 *   });
 * };
 *
 * const sample_group_middleware = (scope: SubwayNode<Route>) => {
 *   scope.use(sample_route_middleware);
 * };
 *
 * Router.group('user', (scope) => {
 *   scope.group('friends', (scope) => {
 *     sample_group_middleware(scope);
 *
 *     scope.add('get', async (ctx) => {});
 *   });
 *
 *   scope.cast('set', (route) => {
 *     sample_route_middleware(route);
 *     const obtain = route.obtain_valid_json({ validate: async (data) => data });
 *
 *     return async (ctx) => {
 *       const data = await obtain(ctx);
 *     };
 *   });
 * });
 *
 * Deno.serve(async (req) => {
 *   const route = Router.find(new URL(req.url).pathname)!;
 *   const result = await route.execute(new Context(req));
 *   return new Response(result);
 * });
 * ```
 */
export class Subway<R extends SubwayAnyRoute = SubwayAnyRoute> implements SubwayNode<R> {
  private registry: Registry<R> = new Map();
  private middlewares: SubwayMiddleware<R>[] = [];

  /**
   * Creates a router; each registered route is constructed with your route class.
   * @param Route Route class constructor (for example your `SimpleRoute` subclass) used to instantiate routes.
   */
  constructor(private Route: RC<R>) {}

  /**
   * Wraps route-level middleware so it can be applied to a {@linkcode SubwayGroup} or a single route.
   * @param middleware Middleware to run when routes are registered.
   */
  create_interceptor(middleware: SubwayMiddleware<R>): SubwayMiddleware<R> {
    return (routeOrGroup: R | SubwayGroup<R>) => {
      if (routeOrGroup instanceof SubwayGroup) {
        routeOrGroup.use(middleware);
      } else {
        middleware(routeOrGroup);
      }
    };
  }

  /**
   * Adds a new route with the specified action and handler.
   * @param action The action associated with the route.
   * @param handler The handler function for the route.
   * @returns The created route.
   * @example
   * ```ts ignore
   * Router.group('user', (scope) => {
   *   scope.add('get', async (ctx) => {
   *     return new Response('User Get');
   *   });
   * });
   * ```
   */
  add(action: SubwayAction, handler: SubwayHandler<R>): R {
    const route = new this.Route(handler) as R;
    for (const middleware of this.middlewares) middleware(route);
    this.registry.set(action, route);
    return route;
  }

  /**
   * Casts a root route using the provided factory.
   * @param factory The factory function to create the route handler.
   * @returns The created route.
   * @example
   * ```ts ignore
   * Router.cast_root((route) => {
   *   route.set_handler((input: string) => `Root Casted: ${input}`);
   *   return (input: string) => `Factory Handled: ${input}`;
   * });
   * ```
   */
  cast_root(factory: SubwayFactory<R>): R {
    return this.cast(undefined!, factory);
  }

  /**
   * Casts a new route with the specified action using the provided factory.
   * @param action The action associated with the route.
   * @param factory The factory function to create the route handler.
   * @returns The created route.
   * @throws {LibError} If the action already exists.
   * @example
   * ```ts ignore
   * Router.cast('example.cast', (route) => {
   *   route.set_handler((input: string) => `Casted: ${input}`);
   *   return (input: string) => `Factory Handled: ${input}`;
   * });
   * ```
   */
  cast(action: SubwayAction, factory: SubwayFactory<R>): R {
    if (this.registry.has(action)) {
      throw new LibError().set_internal({ code: 'router_action_handler_already_exist', action });
    }

    const route = new this.Route() as R;

    const handler = factory(route);
    if (handler !== undefined) route.set_handler(handler);

    for (const middleware of this.middlewares) middleware(route);

    this.registry.set(action, route);

    return route;
  }

  /**
   * Creates a sub-router (group) with the specified prefix and callback.
   * @param prefix The prefix for the group.
   * @param factory The callback function to define the group.
   * @example
   * ```ts ignore
   * Router.group('user', (scope) => {
   *   scope.group('friends', (scope) => {
   *     scope.add('get', async (ctx) => {
   *       return new Response('Friends Get');
   *     });
   *   });
   * });
   * ```
   */
  group(prefix: string, factory: (group: SubwayGroup<R>) => void): void {
    factory(new SubwayGroup<R>(this, prefix));
  }

  /**
   * Creates a bundle of routes using the provided factory.
   * @param factory The callback function to define the bundle of routes.
   * @returns The created bundle of routes.
   * @example
   * ```ts ignore
   * const bundle = Router.bundle((group) => {
   *   group.add('bundle.action', (input: string) => `Bundle Action: ${input}`);
   * });
   * ```
   */
  bundle(factory: (sub: Subway<R>) => void): Bundle<R> {
    const sub = new Subway<R>(this.Route);
    factory(sub);
    return new Bundle(sub);
  }

  /**
   * Injects a bundle of routes with the specified prefix.
   * @param prefix The prefix for the injected routes.
   * @param bundle The bundle of routes to inject.
   * @example
   * ```ts ignore
   * Router.inject('bundle', bundle);
   * ```
   */
  inject(prefix: SubwayAction, bundle: Bundle<R>): void {
    for (const [action, route] of bundle.routes.registry.entries()) {
      this.registry.set(action === undefined ? prefix : `${prefix}.${action}`, route);
    }
  }

  /**
   * Adds a middleware to the router.
   * @param middleware The middleware function to add.
   * @example
   * ```ts ignore
   * Router.use((route) => {
   *   console.log(`Middleware applied to route`);
   * });
   * ```
   */
  use(middleware: SubwayMiddleware<R>): void {
    this.middlewares.push(middleware);
  }

  /**
   * Finds a route by its action.
   * @param action The action associated with the route.
   * @returns The found route or undefined if not found.
   * @example
   * ```ts ignore
   * const route = Router.find('example.action');
   * if (route) {
   *   console.log(route.execute('test input')); // Output: Handled: test input
   * }
   * ```
   */
  find(action: string): R | undefined {
    return this.registry.get(action);
  }

  /**
   * Returns an iterator for all routes in the router.
   * @returns An iterator for all routes.
   * @example
   * ```ts ignore
   * for (const [action, route] of Router.through()) {
   *   console.log(action, route);
   * }
   * ```
   */
  through(): IterableIterator<[SubwayAction | undefined, R]> {
    return this.registry.entries();
  }

  /**
   * Clears all routes from the router.
   * @example
   * ```ts ignore
   * Router.clear();
   * ```
   */
  clear(): void {
    this.registry.clear();
  }
}

/**
 * Represents a sub-router (group) that manages routes with a specific prefix.
 * @template R The type of route.
 * @example
 * ```ts ignore
 * Router.group('user', (scope) => {
 *   scope.group('friends', (scope) => {
 *     scope.add('get', async (ctx) => {
 *       return new Response('Friends Get');
 *     });
 *   });
 * });
 * ```
 */
export class SubwayGroup<R extends SubwayRoute<any, any>> implements SubwayNode<R> {
  private middlewares: SubwayMiddleware<R>[] = [];

  /**
   * Creates a scoped group that prefixes every registered action with `prefix`.
   * @param parent Parent router or group that receives prefixed registrations.
   * @param prefix Dot-separated prefix for nested actions.
   */
  constructor(private parent: SubwayNode<R>, private prefix: SubwayAction) {}

  /**
   * Casts a new route with the specified action using the provided factory.
   * @param action The action associated with the route.
   * @param factory The factory function to create the route handler.
   * @returns The created route.
   * @example
   * ```ts ignore
   * scope.cast('set', (route) => {
   *   const obtain = route.obtain_valid_json({ validate: async (data) => data });
   *
   *   return async (ctx) => {
   *     const data = await obtain(ctx);
   *   };
   * });
   * ```
   */
  cast(action: SubwayAction, factory: SubwayFactory<R>): R {
    const route = this.parent.cast(`${this.prefix}.${action}`, factory) as R;
    for (const middleware of this.middlewares) middleware(route);
    return route;
  }

  /**
   * Adds a new route with the specified action and handler.
   * @param action The action associated with the route.
   * @param handler The handler function for the route.
   * @returns The created route.
   * @example
   * ```ts ignore
   * scope.add('get', async (ctx) => {
   *   return new Response('User Get');
   * });
   * ```
   */
  add(action: SubwayAction, handler: SubwayHandler<R>): R {
    const route = this.parent.add(`${this.prefix}.${action}`, handler) as R;
    for (const middleware of this.middlewares) middleware(route);
    return route;
  }

  /**
   * Casts a root route using the provided factory.
   * @param factory The factory function to create the route handler.
   * @returns The created route.
   * @example
   * ```ts ignore
   * scope.cast_root((route) => {
   *   route.set_handler((input: string) => `Sub Root Casted: ${input}`);
   *   return (input: string) => `Factory Handled: ${input}`;
   * });
   * ```
   */
  cast_root(factory: SubwayFactory<R>): R {
    const route = this.parent.cast(this.prefix, factory) as R;
    for (const middleware of this.middlewares) middleware(route);
    return route;
  }

  /**
   * Adds a root route with the specified handler.
   * @param handler The handler function for the route.
   * @returns The created route.
   * @example
   * ```ts ignore
   * scope.add_root((input: string) => `Sub Root Handled: ${input}`);
   * ```
   */
  add_root(handler: SubwayHandler<R>): R {
    const route = this.parent.add(this.prefix, handler) as R;
    for (const middleware of this.middlewares) middleware(route);
    return route;
  }

  /**
   * Encapsulates child routes, useful for adding specific middlewares to a group of routes without a mutual parent name.
   * @param callback The callback function to define the sub-router.
   * @example
   * ```ts ignore
   * scope.wrap((group) => {
   *   group.add('wrapped.action', (input: string) => `Wrapped Action: ${input}`);
   * });
   * ```
   */
  wrap(callback: (group: SubwayGroup<R>) => void): void {
    callback(new SubwayGroup<R>(this.parent, this.prefix));
  }

  /**
   * Injects a bundle of routes with the specified prefix.
   * @param prefix The prefix for the injected routes.
   * @param bundle The bundle of routes to inject.
   * @example
   * ```ts ignore
   * scope.inject('prefix', bundle);
   * ```
   */
  inject(prefix: SubwayAction, bundle: Bundle<R>): void {
    this.parent.inject(`${this.prefix}.${prefix}`, bundle);
  }

  /**
   * Injects a bundle of routes as root routes.
   * @param bundle The bundle of routes to inject.
   * @example
   * ```ts ignore
   * scope.inject_root(bundle);
   * ```
   */
  inject_root(bundle: Bundle<R>): void {
    this.parent.inject(this.prefix, bundle);
  }

  /**
   * Creates a sub-router (group) with the specified prefix and callback.
   * @param prefix The prefix for the group.
   * @param callback The callback function to define the group.
   * @example
   * ```ts ignore
   * scope.group('prefix', (scope) => {
   *   scope.use(some_middleware);
   *
   *   scope.add('group.action', (input: string) => `Group Action: ${input}`);
   * });
   * ```
   */
  group(prefix: SubwayAction, callback: (group: SubwayGroup<R>) => void): void {
    callback(new SubwayGroup<R>(this.parent, `${this.prefix}.${prefix}`));
  }

  /**
   * Adds a middleware to the sub-router.
   * @param middleware The middleware function to add.
   * @example
   * ```ts ignore
   * scope.use((route) => {
   *   console.log(`Middleware applied to sub-route`);
   * });
   * ```
   */
  use(middleware: SubwayMiddleware<R>): void {
    this.middlewares.push(middleware);
  }
}

/**
 * Represents a bundle of routes.
 * @template R The type of route.
 * @example
 * ```ts ignore
 * const bundle = new Bundle(Router);
 * ```
 */
export class Bundle<R extends SubwayAnyRoute> {
  /**
   * Creates an instance of Bundle.
   * @param routes The Subway instance containing the routes.
   */
  constructor(public routes: Subway<R>) {}
}
