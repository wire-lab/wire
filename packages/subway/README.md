# @wire/subway

A type-safe, composable router for building complex application logic. Subway allows you to define
routes, middleware, and sub-routers with ease, providing a flexible structure for your backend
services.

## Features

- **Type-Safe**: Built with TypeScript generics to ensure type safety across your routes and
  handlers.
- **Composable**: Use `group` routers and `bundles` to organize your application logic into modular
  components.
- **Middleware Support**: detailed control over request processing with middleware at the global,
  sub-router, and route levels; nested sub-routers inherit the middleware of every scope enclosing
  them.
- **Route Injection**: Easily inject bundles of routes into different parts of your application.
- **Flexible Handlers**: Define custom route types and handlers to fit your specific needs.
- **Custom Separator**: Join prefixes and actions with `.` or any separator you choose.

## Installation

```bash
deno add @wire/subway
```

## Usage

### 1. Basic Setup

First, define your route type and initialize the `Subway` router.

```ts ignore
import { Subway } from '@wire/subway';
import { SimpleRoute } from '@wire/subway/routes/simple.ts';

// Define your Context and Result types
type Result = Promise<Response>;
class Context {
  constructor(public readonly req: Request) {}
}

// Extend SimpleRoute for your specific use case
class Route extends SimpleRoute<Context, Result> {
  // Add custom helper methods here
}

// Initialize the router
const Router = new Subway(Route);
```

The router joins group prefixes and actions with `.` by default. Pass a `separator` to use something
else — it applies to nested groups, bundles, and injections alike:

```ts ignore
const Router = new Subway(Route, { separator: '/' });

Router.group('user', (scope) => {
  scope.add('get', async (ctx) => new Response('User Profile'));
});

Router.find('user/get');
```

### 2. Defining Routes

You can add routes directly to the router or within sub-scopes.

```ts ignore
// Add a simple route
Router.add('health', async (ctx) => {
  return new Response('OK');
});

// Use 'group' to create a scoped area (e.g., /user/...)
Router.group('user', (scope) => {
  scope.add('get', async (ctx) => {
    // Action: user.get
    return new Response('User Profile');
  });
});
```

### 3. Middleware

Middleware can be applied globally, to a sub-scope, or to individual routes.

```ts ignore
// Global middleware
Router.use((route) => {
  console.log('Global middleware');
});

// Scoped middleware
Router.group('admin', (scope) => {
  scope.use((route) => {
    console.log('Admin middleware');
  });

  scope.add('dashboard', async (ctx) => {
    return new Response('Admin Dashboard');
  });
});
```

Scoped middleware is inherited by everything declared inside the scope, however deeply nested:

```ts ignore
Router.group('admin', (scope) => {
  scope.use(require_admin); // applies to `admin.dashboard` and to `admin.users.list`

  scope.add('dashboard', async (ctx) => {/* ... */});

  scope.group('users', (scope) => {
    scope.add('list', async (ctx) => {/* ... */});
  });
});
```

Middleware is applied to a route outermost-first: global middleware, then each enclosing group's in
order, then the route's own. (How a route then orders its own pipeline is up to the route class.)

> **Bundles are the exception.** A bundle builds its routes in its own router, and `inject` only
> copies the finished routes into the destination. Middleware registered on the destination router
> or group does **not** reach injected routes — apply guards inside the bundle factory itself.

### 4. Advanced Route Configuration (Casting)

Use `cast` to configure routes with specific logic or validation before the handler.

```ts ignore
Router.cast('create', (route) => {
  // Configure the route instance here
  route.use(someMiddleware);

  // Return the handler function
  return async (ctx) => {
    return new Response('Created');
  };
});
```

### 5. Route Bundles & Injection

Bundles allow you to define routes independently and inject them later.

```ts ignore
const authBundle = Router.bundle((group) => {
  group.add('login', async (ctx) => {/* ... */});
  group.add('logout', async (ctx) => {/* ... */});
});

// Inject into the main router under 'auth' prefix
Router.inject('auth', authBundle);
// Resulting actions: auth.login, auth.logout
```

### 6. Execution

Find and execute routes based on the action name.

```ts ignore
Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Map URL path to action name (e.g., /user/get -> user.get)
  const action = url.pathname.slice(1).replace(/\//g, '.');

  const route = Router.find(action);

  if (route) {
    return await route.execute(new Context(req));
  }

  return new Response('Not Found', { status: 404 });
});
```

## API Reference

### `Subway`

The main router class.

- `new Subway(Route, options?)`: Create a router. `options.separator` sets the string placed between
  prefixes and actions (default `.`).
- `add(action, handler)`: Register a route.
- `group(prefix, callback)`: Create a sub-router (group).
- `cast(action, factory)`: Register a route with custom configuration.
- `use(middleware)`: Register middleware.
- `bundle(factory)`: Create a reusable bundle of routes.
- `inject(prefix, bundle)`: Inject a bundle into the router.
- `find(action)`: Retrieve a route by action name.

### `SubwayNode` (Scope)

Interface for sub-routers, providing similar methods to `Subway` but scoped to a prefix.

- `add`, `group`, `cast`, `use`, `inject` work relative to the current scope.
- `cast_root`, `add_root`, `inject_root` register at the scope's own prefix, without a nested
  action.
- `wrap(callback)`: Create a nested scope with no prefix of its own — useful for applying middleware
  to a subset of routes that share no parent name.
