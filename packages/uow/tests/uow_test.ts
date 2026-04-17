import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from 'jsr:@std/assert@0.205.0';
import {
  AfterCommitTarget,
  TransactionNotFoundError,
  UnitOfWork,
  UnitOfWorkNotFoundError,
  UnitOfWorkScope,
} from '../mod.ts';

function deferredError(message: string): Error {
  return new Error(message);
}

function resolvesWithLog(log: string[], entry: string): () => Promise<void> {
  return () => {
    log.push(entry);
    return Promise.resolve();
  };
}

Deno.test('AfterCommitTarget emits in insertion order', () => {
  const target = new AfterCommitTarget();
  const sequence: string[] = [];
  target.add(() => sequence.push('first'));
  target.add(() => sequence.push('second'));

  target.emit();

  assertEquals(sequence, ['first', 'second']);
});

Deno.test('UnitOfWork set/find/get returns transaction and sessions', () => {
  const uow = new UnitOfWork();
  const tx = {
    session: { id: 'pg-1' },
    cycle: { commit: async () => {}, rollback: async () => {} },
  };

  uow.set('postgres', tx);

  assertStrictEquals(uow.find('postgres'), tx);
  assertStrictEquals(uow.get('postgres'), tx);
});

Deno.test('UnitOfWork get throws TransactionNotFoundError when missing', () => {
  const uow = new UnitOfWork();
  assertThrows(() => uow.get('unknown'), TransactionNotFoundError);
});

Deno.test('UnitOfWork commit runs in insertion order and emits afterCommit', async () => {
  const uow = new UnitOfWork();
  const log: string[] = [];

  uow.set('postgres', {
    session: {},
    cycle: {
      commit: resolvesWithLog(log, 'commit:postgres'),
      rollback: resolvesWithLog(log, 'rollback:postgres'),
    },
  });
  uow.set('mongo', {
    session: {},
    cycle: {
      commit: resolvesWithLog(log, 'commit:mongo'),
      rollback: resolvesWithLog(log, 'rollback:mongo'),
    },
  });
  uow.afterCommit.add(() => log.push('afterCommit'));

  await uow.commit();

  assertEquals(log, ['commit:postgres', 'commit:mongo', 'afterCommit']);
});

Deno.test('UnitOfWork commit stops on first commit failure', async () => {
  const uow = new UnitOfWork();
  const log: string[] = [];
  const expected = deferredError('commit-failed');

  uow.set('postgres', {
    session: {},
    cycle: {
      commit: () => {
        log.push('commit:postgres');
        return Promise.reject(expected);
      },
      rollback: resolvesWithLog(log, 'rollback:postgres'),
    },
  });
  uow.set('mongo', {
    session: {},
    cycle: {
      commit: resolvesWithLog(log, 'commit:mongo'),
      rollback: resolvesWithLog(log, 'rollback:mongo'),
    },
  });
  uow.afterCommit.add(() => log.push('afterCommit'));

  await assertRejects(() => uow.commit(), Error, expected.message);
  assertEquals(log, ['commit:postgres']);
});

Deno.test('UnitOfWork rollback runs in insertion order and stops on first rollback failure', async () => {
  const uow = new UnitOfWork();
  const log: string[] = [];
  const expected = deferredError('rollback-failed');

  uow.set('postgres', {
    session: {},
    cycle: {
      commit: resolvesWithLog(log, 'commit:postgres'),
      rollback: () => {
        log.push('rollback:postgres');
        return Promise.reject(expected);
      },
    },
  });
  uow.set('mongo', {
    session: {},
    cycle: {
      commit: resolvesWithLog(log, 'commit:mongo'),
      rollback: resolvesWithLog(log, 'rollback:mongo'),
    },
  });

  await assertRejects(() => uow.rollback(), Error, expected.message);
  assertEquals(log, ['rollback:postgres']);
});

Deno.test('UnitOfWorkScope get throws outside cast', () => {
  const scope = new UnitOfWorkScope();
  assertThrows(() => scope.get(), UnitOfWorkNotFoundError);
});

Deno.test('UnitOfWorkScope cast commits on success', async () => {
  const scope = new UnitOfWorkScope();
  const log: string[] = [];

  const result = await scope.cast((uow) => {
    uow.set('postgres', {
      session: { tx: 'ok' },
      cycle: {
        commit: resolvesWithLog(log, 'commit'),
        rollback: resolvesWithLog(log, 'rollback'),
      },
    });
    return 'done';
  });

  assertEquals(result, 'done');
  assertEquals(log, ['commit']);
});

Deno.test('UnitOfWorkScope cast rolls back and rethrows when callback fails', async () => {
  const scope = new UnitOfWorkScope();
  const log: string[] = [];
  const expected = deferredError('domain-failed');

  const rejection = scope.cast((uow) => {
    uow.set('postgres', {
      session: {},
      cycle: {
        commit: resolvesWithLog(log, 'commit'),
        rollback: resolvesWithLog(log, 'rollback'),
      },
    });
    throw expected;
  });

  await assertRejects(() => rejection, Error, expected.message);
  assertEquals(log, ['rollback']);
});

Deno.test('UnitOfWorkScope default safeRollback attempts rollback on commit failure', async () => {
  const scope = new UnitOfWorkScope();
  const log: string[] = [];

  const rejection = scope.cast((uow) => {
    uow.set('postgres', {
      session: {},
      cycle: {
        commit: () => {
          log.push('commit');
          return Promise.reject(deferredError('commit-failed'));
        },
        rollback: resolvesWithLog(log, 'rollback'),
      },
    });
  });

  await assertRejects(() => rejection, Error, 'commit-failed');
  assertEquals(log, ['commit', 'rollback']);
});

Deno.test('UnitOfWorkScope legacyBestEffort does not rollback on commit failure', async () => {
  const scope = new UnitOfWorkScope({ commitFailurePolicy: 'legacyBestEffort' });
  const log: string[] = [];

  const rejection = scope.cast((uow) => {
    uow.set('postgres', {
      session: {},
      cycle: {
        commit: () => {
          log.push('commit');
          return Promise.reject(deferredError('commit-failed'));
        },
        rollback: resolvesWithLog(log, 'rollback'),
      },
    });
  });

  await assertRejects(() => rejection, Error, 'commit-failed');
  assertEquals(log, ['commit']);
});

Deno.test('UnitOfWorkScope aggregates callback error and rollback error', async () => {
  const scope = new UnitOfWorkScope();

  const rejection = scope.cast((uow) => {
    uow.set('postgres', {
      session: {},
      cycle: {
        commit: () => Promise.resolve(),
        rollback: () => Promise.reject(deferredError('rollback-failed')),
      },
    });
    throw deferredError('domain-failed');
  });

  await assertRejects(
    () => rejection,
    AggregateError,
    'Rollback failed while handling UnitOfWork error',
  );
});

Deno.test('UnitOfWorkScope keeps async context within cast', async () => {
  const scope = new UnitOfWorkScope();

  await scope.cast(async (uow) => {
    const fromScope = scope.get();
    assertStrictEquals(fromScope, uow);
    await Promise.resolve();
    assertStrictEquals(scope.get(), uow);
  });
});

Deno.test('UnitOfWorkScope isolates parallel casts', async () => {
  const scope = new UnitOfWorkScope();

  const [first, second] = await Promise.all([
    scope.cast(async (uow) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      return scope.get() === uow;
    }),
    scope.cast(async (uow) => {
      await Promise.resolve();
      return scope.get() === uow;
    }),
  ]);

  assertStrictEquals(first, true);
  assertStrictEquals(second, true);
});
