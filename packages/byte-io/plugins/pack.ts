/**
 * @module
 *
 * Pack/unpack bridge plugin for byte IO.
 *
 * This plugin adds `pack(value)` methods without depending on a particular
 * serialization library. Pass adapters for `msgpackr`, `@std/msgpack`, JSON, or
 * any other codec that converts values to and from `Uint8Array`.
 *
 * The plugin depends on the standard plugin at the type level because packed
 * payloads are written through framed `bytes()`.
 */
import { create_byte_plugin } from '../byte-io.ts';
import type { BytePlugin } from '../byte-io.ts';
import type { StandardPlugin } from './standard.ts';

/** Function that serializes a value into bytes. */
export type PackFn = (value: unknown) => Uint8Array;

/** Function that deserializes bytes into a value. */
export type UnpackFn = <T = unknown>(bytes: Uint8Array) => T;

/** Codec functions used by {@linkcode create_pack_plugin}. */
export type PackCodec = {
  /** Serializes a value into bytes. */
  pack: PackFn;
  /** Deserializes bytes into a value. */
  unpack: UnpackFn;
};

/** Reader methods installed by a pack plugin. */
export interface PackReaderMethods {
  /** Reads framed bytes and unpacks them into a value. */
  pack<T = unknown>(): T;
}

/** Writer methods installed by a pack plugin. */
export interface PackWriterMethods {
  /** Packs a value and writes it as framed bytes. */
  pack(value: unknown): this;
}

/** Pack plugin type. */
export type PackPlugin = BytePlugin<PackReaderMethods, PackWriterMethods>;

/**
 * Creates a pack bridge plugin from injected serialization functions.
 *
 * @param codec Serialization and deserialization functions. The writer calls
 * `codec.pack(value)` and stores the result with standard framed `bytes()`. The
 * reader reads framed bytes and passes them to `codec.unpack(bytes)`.
 */
export function create_pack_plugin({ pack, unpack }: PackCodec): PackPlugin {
  return create_byte_plugin<[StandardPlugin]>()({
    reader: {
      pack<T = unknown>(): T {
        return unpack<T>(this.bytes());
      },
    },
    writer: {
      pack(value: unknown): typeof this {
        this.bytes(pack(value));
        return this;
      },
    },
  });
}
