# @wire/byte-io

`@wire/byte-io` is a plugin-composed `Uint8Array` reader and writer for small, explicit binary
protocols.

The package provides a tiny core and keeps codecs opt-in. The root module centers the `ByteIo`
facade; ready-made codecs live behind explicit plugin entrypoints.

## Features

- Plugin-composed reader, writer, and allocation-writer classes.
- Strong TypeScript inference for methods contributed by plugins.
- Type-only plugin dependencies with explicit runtime composition.
- Raw byte append in the core and framed byte helpers in the standard plugin.
- Standard primitive codecs for numbers, booleans, strings, bigints, and byte arrays.
- Strict no-padding base64url plugin with configurable alphabets.
- Pack/unpack bridge plugin for serializers such as `msgpackr` without making them core
  dependencies.
- Cross-runtime design for Deno, Node.js, and Bun.

## Install

```bash
deno add jsr:@wire/byte-io
```

## Quick Start

Compose classes from the plugins your protocol needs, then use the generated `Writer` and `Reader`
classes.

```ts ignore
import { ByteIo } from 'jsr:@wire/byte-io';
import { create_standard_plugin } from 'jsr:@wire/byte-io/plugins/standard';

const { Reader: ByteReader, Writer: ByteWriter } = ByteIo.create_io({
  plugins: [create_standard_plugin()],
});

const bytes = new ByteWriter()
  .uint8(1)
  .uint32(42)
  .string('hello')
  .bytes(new Uint8Array([1, 2, 3]))
  .finish();

const reader = new ByteReader(bytes);

const version = reader.uint8();
const count = reader.uint32();
const message = reader.string();
const payload = reader.bytes();

console.log({ version, count, message, payload });
```

## Core Concepts

### Explicit Composition

`ByteIo.create_io()` installs exactly the plugins you pass, in the order you pass them.

```ts ignore
const { Reader: ByteReader, Writer: ByteWriter } = ByteIo.create_io({
  plugins: [create_standard_plugin(), create_b64u_plugin()],
});
```

Plugins do not install their dependencies at runtime. This keeps protocol assembly predictable and
avoids hidden equivalence rules for factory-created plugins.

### Type-Only Dependencies

Plugins can still declare the methods they expect while being authored:

```ts ignore
import { ByteIo } from 'jsr:@wire/byte-io';
import type { StandardPlugin } from 'jsr:@wire/byte-io/plugins/standard';

const customPlugin = ByteIo.create_plugin<[StandardPlugin]>()({
  writer: {
    tagged_payload(tag: number, payload: Uint8Array): typeof this {
      this.uint8(tag);
      this.bytes(payload);
      return this;
    },
  },
});
```

The `[StandardPlugin]` tuple is only used by TypeScript to type `this`. Callers must still include
`create_standard_plugin()` when composing the final classes.

### Raw Bytes vs Framed Bytes

The core writer has one byte operation:

- `add(bytes)`: append raw bytes exactly as provided, with no prefix.

The standard plugin adds framed bytes:

- `bytes(bytes)`: write `uint32(byteLength)` followed by raw bytes.

This separation makes framing explicit and prevents accidental length prefixes in low-level protocol
code.

### Reusable Mutable Steps

Readers, writers, and allocation writers all provide `apply(fn)`. The callback receives the current
mutable object, may call any available methods, and can return the same object or `void`.

```ts ignore
import { ByteIo } from 'jsr:@wire/byte-io';
import { create_standard_plugin } from 'jsr:@wire/byte-io/plugins/standard';

const { Reader: ByteReader, Writer: ByteWriter } = ByteIo.create_io({
  plugins: [create_standard_plugin()],
});

function write_header(writer: ByteIo.WriterOf<typeof ByteWriter>): void {
  writer.uint8(1);
  writer.uint32(Date.now());
}

const bytes = new ByteWriter()
  .apply(write_header)
  .bytes(new Uint8Array([1, 2, 3]))
  .finish();

new ByteReader(bytes)
  .apply((reader) => {
    const version = reader.uint8();
    if (version !== 1) throw new Error('Unsupported version');
  })
  .uint32();
```

## Plugins

### Standard

The standard plugin provides common primitive codecs:

- integers: `uint8`, `int8`, `uint16`, `int16`, `uint32`, `int32`, `uint64`
- floats: `float32`, `float64`
- `bool`
- null-terminated URI-encoded `string`
- `bigint`
- framed `bytes`

All multi-byte numeric values are little-endian.

```ts ignore
import { ByteIo } from 'jsr:@wire/byte-io';
import { create_standard_plugin } from 'jsr:@wire/byte-io/plugins/standard';

const { Reader: ByteReader, Writer: ByteWriter } = ByteIo.create_io({
  plugins: [create_standard_plugin()],
});

const bytes = new ByteWriter()
  .bool(true)
  .float32(3.14)
  .uint64(9007199254740991n)
  .finish();

const reader = new ByteReader(bytes);

reader.bool();
reader.float32();
reader.uint64();
```

### Strict Base64url

The strict base64url plugin encodes and decodes framed byte arrays as no-padding base64url strings.
It accepts only complete groups:

- decoded byte length must be divisible by 3
- encoded string length must be divisible by 4

```ts ignore
import { ByteIo } from 'jsr:@wire/byte-io';
import { create_standard_plugin } from 'jsr:@wire/byte-io/plugins/standard';
import { create_b64u_plugin } from 'jsr:@wire/byte-io/plugins/strict-base64url';

const { Reader: ByteReader, Writer: ByteWriter } = ByteIo.create_io({
  plugins: [create_standard_plugin(), create_b64u_plugin()],
});

const encoded = 'aGVsbG8gd29y';
const bytes = new ByteWriter().b64u(encoded).finish();

new ByteReader(bytes).b64u(); // "aGVsbG8gd29y"
```

Use a custom 64-character alphabet when your protocol needs one:

```ts ignore
const customB64uPlugin = create_b64u_plugin(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
);
```

### Pack

The pack plugin bridges any serializer that can convert values to and from `Uint8Array`.

```ts ignore
import { decode, encode } from 'npm:msgpackr@1';
import { ByteIo } from 'jsr:@wire/byte-io';
import { create_pack_plugin } from 'jsr:@wire/byte-io/plugins/pack';
import { create_standard_plugin } from 'jsr:@wire/byte-io/plugins/standard';

const { Reader: ByteReader, Writer: ByteWriter } = ByteIo.create_io({
  plugins: [
    create_standard_plugin(),
    create_pack_plugin({
      pack(value: unknown): Uint8Array {
        return encode(value) as Uint8Array;
      },
      unpack<T = unknown>(bytes: Uint8Array): T {
        return decode(bytes) as T;
      },
    }),
  ],
});

const bytes = new ByteWriter().pack({ userName: 'Luma', profileId: 42 }).finish();
const value = new ByteReader(bytes).pack<{ userName: string; profileId: number }>();
```

The serializer is injected so the core package does not force a dependency or version choice.

## Writing Custom Plugins

A plugin can add reader methods, writer methods, allocation-writer methods, or any combination of
the three.

```ts ignore
import { ByteIo } from 'jsr:@wire/byte-io';
import type { StandardPlugin } from 'jsr:@wire/byte-io/plugins/standard';

export const create_message_plugin = () =>
  ByteIo.create_plugin<[StandardPlugin]>()({
    reader: {
      message(): { messageType: number; payload: Uint8Array } {
        return {
          messageType: this.uint8(),
          payload: this.bytes(),
        };
      },
    },
    writer: {
      message(value: { messageType: number; payload: Uint8Array }): typeof this {
        this.uint8(value.messageType);
        this.bytes(value.payload);
        return this;
      },
    },
  });
```

Then compose it explicitly:

```ts ignore
const byteIo = ByteIo.create_io({
  plugins: [create_standard_plugin(), create_message_plugin()],
});

export const ByteReader = byteIo.Reader;
export const ByteWriter = byteIo.Writer;

export type ByteReader = ByteIo.ReaderOf<typeof ByteReader>;
export type ByteWriter = ByteIo.WriterOf<typeof ByteWriter>;
```

## API Reference

### Root Module

- `ByteIo.create_io({ plugins })`: creates plugin-composed `Reader`, `Writer`, and `AllocWriter`
  classes.
- `ByteIo.create_plugin<[Deps]>()(definition)`: creates a plugin descriptor with type-only
  dependency context.
- `ByteIo.BaseReader`: base reader with `data`, `view`, `offset`, `n_bytes()`, `skip()`, `apply()`,
  `remaining()`, `complete`, and `incomplete`.
- `ByteIo.BaseWriter`: base writer with `add()`, `apply()`, `alloc()`, `concat()`, `compile()`,
  `clone()`, and `finish()`.
- `ByteIo.BaseAllocWriter`: fixed-size allocation writer used by `alloc()` callbacks.
- `ByteIo.ReaderOf<typeof Reader>`: instance type for a composed reader class.
- `ByteIo.WriterOf<typeof Writer>`: instance type for a composed writer class.
- `ByteIo.AllocWriterOf<typeof AllocWriter>`: instance type for a composed allocation-writer class.

### Plugin Entrypoints

- `@wire/byte-io/plugins/standard`: `create_standard_plugin()`.
- `@wire/byte-io/plugins/strict-base64url`: `create_b64u_plugin(space?)`.
- `@wire/byte-io/plugins/pack`: `create_pack_plugin({ pack, unpack })`.

## Behavior Guarantees

- Plugins are installed in the order supplied to `ByteIo.create_io()`.
- Type-only dependencies are not installed automatically.
- `ByteIo.BaseWriter.add()` never writes a length prefix.
- `apply(fn)` is mutable: it returns the same reader or writer after the callback runs.
- Standard `bytes()` always writes and reads a `uint32` byte length prefix.
- Multi-byte numeric values in the standard plugin are little-endian.
- `finish()` compiles pending byte chunks before returning the output.

## Best Practices

- Keep protocol composition close to the boundary that owns the wire format.
- Install dependency plugins before plugins that call their methods.
- Prefer `add()` only for raw protocol segments whose length is known externally.
- Prefer standard `bytes()` for payloads that should be self-delimiting.
- Keep custom plugin methods symmetric: if a writer method writes a field, add the matching reader
  method in the same plugin.
- Inject third-party codecs through plugin factories instead of importing them in the core protocol
  package.
