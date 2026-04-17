import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from 'jsr:@std/assert@0.205.0';
import { SpawnableConnector } from '../connectors/spawnable.ts';
import { UnitOfWorkNotFoundError, UnitOfWorkScope } from '../mod.ts';

Deno.test('SpawnableConnector throws outside active scope', async () => {
  const connector = new SpawnableConnector(new UnitOfWorkScope(), () =>
    Promise.resolve({
      session: { id: 'pg-1' },
      cycle: { commit: async () => {}, rollback: async () => {} },
    }));

  assertThrows(() => connector.find(), UnitOfWorkNotFoundError);
  assertThrows(() => connector.get(), UnitOfWorkNotFoundError);
  await assertRejects(() => connector.select(), UnitOfWorkNotFoundError);
});

Deno.test('SpawnableConnector select spawns only once in same cast', async () => {
  const scope = new UnitOfWorkScope();
  let spawnCalls = 0;

  const connector = new SpawnableConnector(scope, () => {
    spawnCalls += 1;
    return Promise.resolve({
      session: { id: `session-${spawnCalls}` },
      cycle: { commit: async () => {}, rollback: async () => {} },
    });
  });

  await scope.cast(async () => {
    const first = await connector.select();
    const second = await connector.select();

    assertStrictEquals(first, second);
    assertEquals(first.id, 'session-1');
    assertEquals(connector.find()?.id, 'session-1');
    assertEquals(connector.get().id, 'session-1');
  });

  assertEquals(spawnCalls, 1);
});

Deno.test('SpawnableConnector get throws before select in active scope', async () => {
  const scope = new UnitOfWorkScope();
  const connector = new SpawnableConnector(scope, () =>
    Promise.resolve({
      session: { id: 'pg-1' },
      cycle: { commit: async () => {}, rollback: async () => {} },
    }));

  await scope.cast(() => {
    assertEquals(connector.find(), undefined);
    assertThrows(() => connector.get(), Error, 'Call select() first');
  });
});
