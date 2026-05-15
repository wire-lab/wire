import { expect } from 'jsr:@std/expect@1';
import { ByteIo } from '../mod.ts';
import { create_pack_plugin } from '../plugins/pack.ts';
import { create_standard_plugin } from '../plugins/standard.ts';
import { create_b64u_plugin } from '../plugins/strict-base64url.ts';

Deno.test('standard plugin writes raw and framed bytes separately', () => {
  const { Reader: ByteReader, Writer: ByteWriter } = ByteIo.create_io({
    plugins: [create_standard_plugin()],
  });

  const rawBytes = new Uint8Array([1, 2, 3]);
  const framedBytes = new Uint8Array([4, 5, 6]);
  const bytes = new ByteWriter().add(rawBytes).bytes(framedBytes).finish();
  const reader = new ByteReader(bytes);

  expect(reader.n_bytes(3)).toEqual(rawBytes);
  expect(reader.bytes()).toEqual(framedBytes);
  expect(reader.complete).toEqual(true);
});

Deno.test('strict base64url plugin accepts complete 3-byte groups only', () => {
  const { Reader: ByteReader, Writer: ByteWriter } = ByteIo.create_io({
    plugins: [create_standard_plugin(), create_b64u_plugin()],
  });

  const base64urlValue = 'aGVsbG8gd29y';
  const bytes = new ByteWriter().b64u(base64urlValue).finish();

  expect(new ByteReader(bytes).b64u()).toEqual(base64urlValue);
  expect(() => new ByteWriter().b64u('abc')).toThrow(RangeError);
});

Deno.test('pack plugin delegates serialization to injected functions', () => {
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();
  const { Reader: ByteReader, Writer: ByteWriter } = ByteIo.create_io({
    plugins: [
      create_standard_plugin(),
      create_pack_plugin({
        pack(value: unknown): Uint8Array {
          return textEncoder.encode(JSON.stringify(value));
        },
        unpack<T = unknown>(bytes: Uint8Array): T {
          return JSON.parse(textDecoder.decode(bytes)) as T;
        },
      }),
    ],
  });

  const value = { createdAt: '2026-05-15', profileId: 7 };
  const bytes = new ByteWriter().pack(value).finish();

  expect(new ByteReader(bytes).pack()).toEqual(value);
});

Deno.test('ByteIo facade exposes protocol-specific instance helper types', () => {
  const byteIo = ByteIo.create_io({
    plugins: [create_standard_plugin()],
  });

  const ByteReader = byteIo.Reader;
  const ByteWriter = byteIo.Writer;

  type ByteReader = ByteIo.ReaderOf<typeof ByteReader>;
  type ByteWriter = ByteIo.WriterOf<typeof ByteWriter>;

  const writer: ByteWriter = new ByteWriter().uint16(1024);
  const reader: ByteReader = new ByteReader(writer.finish());

  expect(reader.uint16()).toEqual(1024);
});

Deno.test('apply composes mutable reader, writer, and alloc writer callbacks', () => {
  const { Reader: ByteReader, Writer: ByteWriter } = ByteIo.create_io({
    plugins: [create_standard_plugin()],
  });

  const writeHeader = (writer: ByteIo.WriterOf<typeof ByteWriter>): void => {
    writer.uint8(1);
    writer.uint16(2026);
  };

  const bytes = new ByteWriter()
    .apply(writeHeader)
    .alloc(2, (writer) =>
      writer.apply((allocWriter) => {
        allocWriter.uint16(15);
      }))
    .finish();

  const reader = new ByteReader(bytes).apply((byteReader) => {
    expect(byteReader.uint8()).toEqual(1);
  });

  expect(reader.uint16()).toEqual(2026);
  expect(reader.uint16()).toEqual(15);
  expect(reader.complete).toEqual(true);
});
