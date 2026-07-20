import { assertEquals, assertThrows } from 'jsr:@std/assert@0.205.0';
import { Subway } from '../mod.ts';
import { SimpleRoute } from '../routes/simple.ts';

/** Route that records the middleware marks applied to it, in order of application. */
class MarkRoute extends SimpleRoute<string, string> {
  readonly marks: string[] = [];
}

const mark = (name: string) => (route: MarkRoute) => route.marks.push(name);

const router = () => new Subway(MarkRoute);

/** All registered actions, as a plain object of action to applied marks. */
const marks = (sub: Subway<MarkRoute>): Record<string, string[]> =>
  Object.fromEntries([...sub.through()].map(([action, route]) => [String(action), route.marks]));

Deno.test('router middleware applies to top-level routes', () => {
  const sub = router();
  sub.use(mark('global'));

  sub.add('plain', (input) => input);
  sub.cast('casted', () => (input) => input);

  assertEquals(marks(sub), { plain: ['global'], casted: ['global'] });
});

Deno.test('group middleware applies to routes of that group', () => {
  const sub = router();

  sub.group('outer', (outer) => {
    outer.use(mark('outer'));
    outer.add('direct', (input) => input);
    outer.cast('casted', () => (input) => input);
  });

  assertEquals(marks(sub), { 'outer.direct': ['outer'], 'outer.casted': ['outer'] });
});

Deno.test('group middleware applies to routes in a nested group', () => {
  const sub = router();

  sub.group('outer', (outer) => {
    outer.use(mark('outer'));

    outer.add('direct', (input) => input);
    outer.group('inner', (inner) => {
      inner.add('nested', (input) => input);
    });
  });

  assertEquals(marks(sub), {
    'outer.direct': ['outer'],
    'outer.inner.nested': ['outer'],
  });
});

Deno.test('middleware accumulates outermost-first across three levels', () => {
  const sub = router();
  sub.use(mark('global'));

  sub.group('a', (a) => {
    a.use(mark('a'));

    a.group('b', (b) => {
      b.use(mark('b'));

      b.group('c', (c) => {
        c.use(mark('c'));
        c.add('leaf', (input) => input);
      });
    });
  });

  assertEquals(marks(sub), { 'a.b.c.leaf': ['global', 'a', 'b', 'c'] });
});

Deno.test('middleware registered after a nested group still applies to it', () => {
  const sub = router();

  sub.group('outer', (outer) => {
    outer.group('inner', (inner) => {
      inner.add('nested', (input) => input);
    });

    // `use` runs after the route is already registered, so it must not reach it.
    outer.use(mark('late'));
    outer.add('direct', (input) => input);
  });

  assertEquals(marks(sub), { 'outer.inner.nested': [], 'outer.direct': ['late'] });
});

Deno.test('sibling groups do not share middleware', () => {
  const sub = router();

  sub.group('root', (root) => {
    root.group('left', (left) => {
      left.use(mark('left'));
      left.add('leaf', (input) => input);
    });

    root.group('right', (right) => {
      right.add('leaf', (input) => input);
    });
  });

  assertEquals(marks(sub), { 'root.left.leaf': ['left'], 'root.right.leaf': [] });
});

Deno.test('nested groups compose action keys from relative prefixes', () => {
  const sub = router();

  sub.group('a', (a) => {
    a.add('one', (input) => input);

    a.group('b', (b) => {
      b.add('two', (input) => input);
      b.group('c', (c) => c.add('three', (input) => input));
    });
  });

  assertEquals(Object.keys(marks(sub)), ['a.one', 'a.b.two', 'a.b.c.three']);
});

Deno.test('a custom separator joins every level of nesting', () => {
  const sub = new Subway(MarkRoute, { separator: '/' });

  sub.group('a', (a) => {
    a.use(mark('a'));
    a.group('b', (b) => b.add('leaf', (input) => input));
  });

  assertEquals(marks(sub), { 'a/b/leaf': ['a'] });
});

Deno.test('root registrations carry the group prefix as the action', () => {
  const sub = router();
  sub.use(mark('global'));

  sub.group('added', (group) => {
    group.use(mark('group'));
    group.add_root((input) => input);
  });

  sub.group('casted', (group) => {
    group.use(mark('group'));
    group.cast_root(() => (input) => input);
  });

  assertEquals(marks(sub), {
    added: ['global', 'group'],
    casted: ['global', 'group'],
  });
});

Deno.test('a nested group can register a root route under its own prefix', () => {
  const sub = router();

  sub.group('outer', (outer) => {
    outer.use(mark('outer'));
    outer.group('inner', (inner) => inner.add_root((input) => input));
  });

  assertEquals(marks(sub), { 'outer.inner': ['outer'] });
});

Deno.test('the router root route is keyed by undefined', () => {
  const sub = router();
  sub.use(mark('global'));

  sub.cast_root(() => (input) => input);

  assertEquals([...sub.through()].map(([action]) => action), [undefined]);
  assertEquals(sub.find(undefined!)?.marks, ['global']);
});

Deno.test('wrap adds no prefix segment of its own', () => {
  const sub = router();

  sub.group('outer', (outer) => {
    outer.wrap((wrapped) => {
      wrapped.add('leaf', (input) => input);
      wrapped.group('inner', (inner) => inner.add('deep', (input) => input));
    });
  });

  assertEquals(Object.keys(marks(sub)), ['outer.leaf', 'outer.inner.deep']);
});

Deno.test('wrap inherits enclosing middleware and scopes its own', () => {
  const sub = router();
  sub.use(mark('global'));

  sub.group('outer', (outer) => {
    outer.use(mark('outer'));

    outer.wrap((wrapped) => {
      wrapped.use(mark('wrapped'));
      wrapped.add('guarded', (input) => input);
    });

    outer.add('plain', (input) => input);
  });

  assertEquals(marks(sub), {
    'outer.guarded': ['global', 'outer', 'wrapped'],
    'outer.plain': ['global', 'outer'],
  });
});

Deno.test('wrap at the top of a group registers a root route under the group prefix', () => {
  const sub = router();

  sub.group('outer', (outer) => {
    outer.use(mark('outer'));
    outer.wrap((wrapped) => {
      wrapped.use(mark('wrapped'));
      wrapped.add_root((input) => input);
    });
  });

  assertEquals(marks(sub), { outer: ['outer', 'wrapped'] });
});

Deno.test('nested wraps stay flat and keep accumulating middleware', () => {
  const sub = router();

  sub.group('outer', (outer) => {
    outer.wrap((first) => {
      first.use(mark('first'));

      first.wrap((second) => {
        second.use(mark('second'));
        second.add('leaf', (input) => input);
      });
    });
  });

  assertEquals(marks(sub), { 'outer.leaf': ['first', 'second'] });
});

// Registration order is outermost-first, but `SimpleRoute` composes its pipeline from the
// reversed middleware list, so the innermost scope ends up outermost at execution time.
// That is a `SimpleRoute` property, independent of how groups accumulate middleware.
Deno.test('every enclosing scope contributes to the executed route pipeline', () => {
  const trace: string[] = [];
  const wrap_route = (name: string) => (route: MarkRoute) =>
    route.use((input, next) => {
      trace.push(`${name}:before`);
      const result = next(input);
      trace.push(`${name}:after`);
      return result;
    });

  const sub = router();
  sub.use(wrap_route('global'));

  sub.group('outer', (outer) => {
    outer.use(wrap_route('outer'));
    outer.group('inner', (inner) => {
      inner.use(wrap_route('inner'));
      inner.add('leaf', (input) => {
        trace.push('handler');
        return input;
      });
    });
  });

  assertEquals(sub.find('outer.inner.leaf')!.execute('x'), 'x');
  assertEquals(trace, [
    'inner:before',
    'outer:before',
    'global:before',
    'handler',
    'global:after',
    'outer:after',
    'inner:after',
  ]);
});

Deno.test('create_interceptor targets a group or a single route', () => {
  const sub = router();
  const interceptor = sub.create_interceptor(mark('intercepted'));

  sub.group('outer', (outer) => {
    interceptor(outer as never);
    outer.group('inner', (inner) => inner.add('nested', (input) => input));
  });

  sub.cast('single', (route) => {
    interceptor(route);
    return (input) => input;
  });

  assertEquals(marks(sub), {
    'outer.inner.nested': ['intercepted'],
    single: ['intercepted'],
  });
});

Deno.test('duplicate actions from different scopes are rejected', () => {
  const sub = router();

  sub.group('outer', (outer) => {
    outer.group('inner', (inner) => inner.cast('leaf', () => (input) => input));
  });

  assertThrows(() => sub.cast('outer.inner.leaf', () => (input) => input));
});

Deno.test('injected bundles keep their own actions and do not receive destination middleware', () => {
  const sub = router();
  sub.use(mark('global'));

  const bundle = sub.bundle((inner) => {
    inner.use(mark('bundle'));
    inner.add('login', (input) => input);
    inner.add_root((input) => input);
  });

  sub.group('outer', (outer) => {
    outer.use(mark('outer'));
    outer.inject('auth', bundle);
  });

  sub.add('plain', (input) => input);

  // Bundle routes are built in their own router; only the bundle's own middleware applies.
  assertEquals(marks(sub), {
    'outer.auth.login': ['bundle'],
    'outer.auth': ['bundle'],
    plain: ['global'],
  });
});

Deno.test('inject_root places bundle actions at the scope prefix', () => {
  const sub = router();

  const bundle = sub.bundle((inner) => inner.add('login', (input) => input));

  sub.group('auth', (auth) => auth.inject_root(bundle));

  assertEquals(Object.keys(marks(sub)), ['auth.login']);
});

Deno.test('inject_root inside wrap keeps the enclosing group prefix', () => {
  const sub = router();

  const bundle = sub.bundle((inner) => {
    inner.add('login', (input) => input);
    inner.add_root((input) => input);
  });

  sub.group('auth', (auth) => auth.wrap((wrapped) => wrapped.inject_root(bundle)));

  assertEquals(Object.keys(marks(sub)), ['auth.login', 'auth']);
});

Deno.test('clear removes every registered route', () => {
  const sub = router();

  sub.group('outer', (outer) => outer.group('inner', (inner) => inner.add('leaf', (i) => i)));
  sub.clear();

  assertEquals([...sub.through()], []);
});
