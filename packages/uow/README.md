# @wire/uow

`@wire/uow` coordinates multiple transactional resources as a single logical operation and
propagates the active Unit of Work through async context.

This package is built for two primary goals:

- Compose multiple transaction participants (for example Postgres + Mongo) in one unit.
- Avoid manual dependency threading by resolving the current unit from `AsyncLocalStorage`.

## Features

- Multi-resource transaction orchestration in insertion order.
- Strict transaction lookup via `get()` with explicit errors.
- Async-context scope with `cast()` for automatic commit/rollback lifecycle.
- Configurable commit-failure behavior (`safeRollback` or `legacyBestEffort`).
- `afterCommit` listeners for post-commit side effects.
- Cross-runtime compatibility (Deno, Node.js, Bun).

## Install

```bash
deno add jsr:@wire/uow
```

## Why use this library?

If your service writes to more than one system in a request (for example SQL + event store, or SQL +
document DB), you often need:

1. A single place to register participants that can commit/rollback.
2. A way to access the current transaction session across service layers without passing `uow`
   through every function signature.

`@wire/uow` provides both with a tiny API.

## Quick Start

```ts ignore
import { UnitOfWorkScope } from 'jsr:@wire/uow';

const scope = new UnitOfWorkScope();

await scope.cast(async (uow) => {
  uow.set('postgres', {
    session: { txId: 'pg-1' },
    cycle: {
      commit: async () => console.log('pg commit'),
      rollback: async () => console.log('pg rollback'),
    },
  });

  uow.set('mongo', {
    session: { sessionId: 'mongo-1' },
    cycle: {
      commit: async () => console.log('mongo commit'),
      rollback: async () => console.log('mongo rollback'),
    },
  });

  // domain logic
  const pgSession = uow.get<{ txId: string }>('postgres').session;
  const mongoSession = uow.get<{ sessionId: string }>('mongo').session;
  void pgSession;
  void mongoSession;
});
```

## Usage Patterns

### 1) Register participants from different modules

```typescript
import { UnitOfWorkScope } from 'jsr:@wire/uow';

const scope = new UnitOfWorkScope();

async function registerPostgres() {
  const uow = scope.get();
  uow.set('postgres', {
    session: { txId: 'pg' },
    cycle: { commit: async () => {}, rollback: async () => {} },
  });
}

async function registerMongo() {
  const uow = scope.get();
  uow.set('mongo', {
    session: { txId: 'mg' },
    cycle: { commit: async () => {}, rollback: async () => {} },
  });
}

await scope.cast(async () => {
  await registerPostgres();
  await registerMongo();
  // both resources are now part of the same logical unit
});
```

### 2) Use commit-failure policy explicitly

```typescript
import { UnitOfWorkScope } from 'jsr:@wire/uow';

const scope = new UnitOfWorkScope({
  commitFailurePolicy: 'safeRollback', // default
});

await scope.cast(async (uow) => {
  uow.set('postgres', {
    session: {},
    cycle: {
      commit: async () => {
        throw new Error('commit failed');
      },
      rollback: async () => {
        // attempted when commit fails in safeRollback mode
      },
    },
  });
}).catch(() => {
  // expected for this demonstration snippet
});
```

`legacyBestEffort` keeps commit-failure behavior non-compensating (no rollback attempt on commit
error), but callback failures still rollback.

### 3) Trigger side-effects only after successful commit

```typescript
import { UnitOfWork } from 'jsr:@wire/uow';

const uow = new UnitOfWork();
uow.afterCommit.add(() => {
  // publish outbox event, invalidate cache, etc.
});
```

## API Reference

### `class UnitOfWork`

- `set(id, tx)`: register or replace a transaction participant.
- `find(id)`: get participant or `undefined`.
- `get(id)`: strict lookup; throws `TransactionNotFoundError` when missing.
- `commit()`: sequentially commits all participants, then emits `afterCommit`.
- `rollback()`: sequentially rolls back all participants.
- `afterCommit`: `AfterCommitTarget` listener set.

### `class UnitOfWorkScope`

- `new UnitOfWorkScope(options?)`
  - `commitFailurePolicy?: 'safeRollback' | 'legacyBestEffort'`
- `find()`: active scope instance or `undefined`.
- `get()`: strict scope access; throws `UnitOfWorkNotFoundError` outside `cast()`.
- `cast(fn)`: runs callback in new async-scoped `UnitOfWork` with automatic lifecycle.

### Errors

- `TransactionNotFoundError`
- `UnitOfWorkNotFoundError`

## Behavior Guarantees

- Transactions commit/rollback in registration order.
- On callback failure inside `cast()`, rollback is always attempted.
- On commit failure:
  - `safeRollback`: rollback is attempted, then commit error is rethrown.
  - `legacyBestEffort`: commit error is rethrown immediately.
- If rollback fails while handling another error, an `AggregateError` is thrown.

## Best Practices

- Use stable IDs (`'postgres'`, `'mongo'`, symbols) for participants.
- Keep transaction control callbacks idempotent when possible.
- Prefer one `UnitOfWorkScope` per application boundary (request/job/message).
- Keep `afterCommit` handlers fast and non-blocking.

## Anti-patterns

- Calling `scope.get()` outside `cast()`.
- Mixing participant IDs dynamically without naming conventions.
- Performing irreversible side-effects before commit.
