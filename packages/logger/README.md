# @wire/logger

A blazing fast, flexible, strongly-typed logger for Deno, designed for modern applications. It features zero-dependency (by default), async context propagation for request tracking, strict typing, and a composable architecture.

## Features

- **Async Context Support**: Automatically propagate metadata (like `requestId`) across async operations without passing logger instances manually.
- **Strongly Typed**: Built with TypeScript in mind.
- **Flexible Transports**: Implement your own output destination easily.
- **Zero Dependencies**: Core functionality relies only on standard libraries.
- **Structured Logging**: All logs are objects, making them easy to parse and query.
- **Granular Levels**: 8 levels of logging from `emergency` to `debug3`.

## Installation

```bash
deno add @wire/logger
```

## Core Concepts

The logger is built around the concept of a **Global Logger** and **Contextual Loggers**.

- **Global Logger**: The base logger instance initialized at application start.
- **Async Context**: Using `AsyncLocalStorage`, the logger can maintain state (metadata) unique to a specific async execution flow (like an HTTP request). `use_logger()` always returns the correct logger for the current context.

## Usage

### 1. Basic Setup (Deno Example)

Initialize the logger at the entry point of your application.

```typescript
import { init_logger, create_logger, LogLevel, LogLevelNameMap } from '@wire/logger';

// Initialize the global logger with a simple JSON stdout transport
init_logger({
  transport: (lvl, data, meta) => {
    // Combine level, data, and metadata into a single JSON object
    const output = JSON.stringify({
      level: LogLevelNameMap.get(lvl),
      ...meta,
      ...data,
    });
    console.log(output);
  },
  format_error: (e) => e, // Optional: transform errors before logging
  level: LogLevel.info,   // Set the minimum log level
});
```

### 2. Logging Messages

Use `use_logger()` to get the logger instance anywhere in your code.

```typescript
import { use_logger } from '@wire/logger';

const log = use_logger();

log.info({ msg: 'Server started', port: 8080 });
log.error({ msg: 'Database connection failed', error: new Error('Connection timeout') });
```

### 3. Async Context (Request Tracking)

To track logs across an async flow (e.g., an HTTP request), use `cast_logger`. All logs within the callback (and any async functions called by it) will share the same logger instance and metadata.

```typescript
import { cast_logger } from '@wire/logger';

Deno.serve(async (req) => {
  return await cast_logger(async (log) => {
    // Attach metadata to this request's logger
    log.upd_meta({ 
      requestId: crypto.randomUUID(), 
      method: req.method, 
      url: req.url 
    });

    log.info({ msg: 'Request received' });

    await handleRequest(); // Logs inside here will have the requestId

    return new Response('OK');
  });
});

async function handleRequest() {
  const log = use_logger();
  // This log will automatically include requestId, method, and url
  log.info({ msg: 'Processing business logic' });
}
```

### 4. Metadata & Stack Tracing

You can add metadata or "stack" tags to trace execution paths.

```typescript
const log = use_logger();

// Add metadata to current context
log.upd_meta({ userId: 'u_123' });

// Add a 'stack' trace (useful for breadcrumbs)
log.stack('auth');
log.stack('validate');

log.info({ msg: 'User validated' });
// Output: { ..., "userId": "u_123", "code": "auth.validate", "msg": "User validated" }
```

## API Reference

### `init_logger(opts)`
Initializes the global logger. Must be called once at startup.

| Option | Type | Description |
|---|---|---|
| `transport` | `(lvl: LogLevel, data: Data, meta: Data) => void` | Function to handle log output. |
| `format_error` | `(e: unknown) => unknown` | Function to format errors before they are passed to the transport. |
| `level` | `LogLevel` | Minimum log level to output. |

### `use_logger()`
Returns the current contextual logger. If called outside of a `cast_logger` context, returns the global logger.

### `cast_logger(callback)`
Creates a new logger context. The callback receives the new logger instance.

### `Logger` Instance Methods

| Method | Description |
|---|---|
| `emergency(data)` | Log at `emergency` level (0) |
| `alert(data)` | Log at `alert` level (1) |
| `error(data)` | Log at `error` level (2) |
| `warning(data)` | Log at `warning` level (3) |
| `info(data)` | Log at `info` level (4) |
| `debug1(data)` | Log at `debug1` level (5) |
| `debug2(data)` | Log at `debug2` level (6) |
| `debug3(data)` | Log at `debug3` level (7) |
| `upd_meta(data)` | Merge new metadata into the current logger state. |
| `stack(str)` | Append a string to the `code` field (dot-separated). |
| `clone()` | Create a shallow copy of the logger. |
| `dispatch(lvl, action)` | Run an async action and log any errors automatically. |

### `LogLevel` Enum

```typescript
export enum LogLevel {
  emergency = 0,
  alert = 1,
  error = 2,
  warning = 3,
  info = 4,
  debug1 = 5,
  debug2 = 6,
  debug3 = 7,
}
```

### `LogLevelNameMap`

A `Map<LogLevel, string>` providing the string name for each log level (e.g., `LogLevel.info` -> "info").

## Platform Examples

### Node.js

```typescript
import { init_logger, LogLevel, LogLevelNameMap } from '@wire/logger';
import { writer } from 'node:process';

init_logger({
  transport: (lvl, data, meta) => {
    const output = JSON.stringify({
      level: LogLevelNameMap.get(lvl),
      time: new Date().toISOString(),
      ...meta,
      ...data,
    });
    process.stdout.write(output + '\n');
  },
  format_error: (e) => e,
  level: LogLevel.info,
});
```

### Bun

```typescript
import { init_logger, LogLevel, LogLevelNameMap } from '@wire/logger';

init_logger({
  transport: (lvl, data, meta) => {
    const output = JSON.stringify({
      level: LogLevelNameMap.get(lvl),
      ...meta,
      ...data,
    });
    console.log(output);
  },
  format_error: (e) => e,
  level: LogLevel.info,
});
```
