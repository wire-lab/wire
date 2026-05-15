/**
 * @module
 *
 * Standard numeric and framed byte codecs for byte IO.
 *
 * This plugin contains the small, conventional building blocks used by most
 * byte protocols: fixed-width numeric values, booleans, null-terminated
 * strings, bigints, and `uint32` length-prefixed byte arrays. All multi-byte
 * numeric values are encoded little-endian.
 *
 * The plugin deliberately keeps `bytes(bytes)` separate from the base writer's
 * `add(bytes)`: `add()` appends raw bytes without framing, while `bytes()`
 * writes `uint32(byteLength)` followed by the raw bytes.
 */
import { create_byte_plugin } from '../byte-io.ts';
import type { BytePlugin } from '../byte-io.ts';

/** Reader methods installed by the standard plugin. */
export interface StandardReaderMethods {
  /** Reads an unsigned 8-bit integer and advances by 1 byte. */
  uint8(): number;
  /** Reads a signed 8-bit integer and advances by 1 byte. */
  int8(): number;
  /** Reads an unsigned 16-bit little-endian integer and advances by 2 bytes. */
  uint16(): number;
  /** Reads a signed 16-bit little-endian integer and advances by 2 bytes. */
  int16(): number;
  /** Reads an unsigned 32-bit little-endian integer and advances by 4 bytes. */
  uint32(): number;
  /** Reads a signed 32-bit little-endian integer and advances by 4 bytes. */
  int32(): number;
  /** Reads an unsigned 64-bit little-endian integer and advances by 8 bytes. */
  uint64(): bigint;
  /** Reads a 32-bit little-endian float and advances by 4 bytes. */
  float32(): number;
  /** Reads a 64-bit little-endian float and advances by 8 bytes. */
  float64(): number;
  /** Reads a boolean encoded as `0` or `1`. */
  bool(): boolean;
  /** Reads a null-terminated URI-encoded string. */
  string(): string;
  /** Reads a bigint encoded as `uint16(byteLength)` followed by big-endian bytes. */
  bigint(): bigint;
  /** Reads `uint32(byteLength)` followed by that many bytes. */
  bytes(): Uint8Array;
}

/** Writer methods installed by the standard plugin. */
export interface StandardWriterMethods {
  /** Writes an unsigned 8-bit integer. */
  uint8(value: number): this;
  /** Writes a signed 8-bit integer. */
  int8(value: number): this;
  /** Writes an unsigned 16-bit little-endian integer. */
  uint16(value: number): this;
  /** Writes a signed 16-bit little-endian integer. */
  int16(value: number): this;
  /** Writes an unsigned 32-bit little-endian integer. */
  uint32(value: number): this;
  /** Writes a signed 32-bit little-endian integer. */
  int32(value: number): this;
  /** Writes an unsigned 64-bit little-endian integer. */
  uint64(value: bigint): this;
  /** Writes a 32-bit little-endian float. */
  float32(value: number): this;
  /** Writes a 64-bit little-endian float. */
  float64(value: number): this;
  /** Writes a boolean as `0` or `1`. */
  bool(value: boolean): this;
  /** Writes a null-terminated URI-encoded string. */
  string(value: string): this;
  /** Writes a bigint as `uint16(byteLength)` followed by big-endian bytes. */
  bigint(value: bigint): this;
  /** Writes `uint32(byteLength)` followed by raw bytes. */
  bytes(bytes: Uint8Array): this;
}

/** Allocation writer methods installed by the standard plugin. */
export interface StandardAllocMethods {
  /** Writes a signed 8-bit integer. */
  int8(value: number): this;
  /** Writes an unsigned 16-bit little-endian integer. */
  uint16(value: number): this;
  /** Writes a signed 16-bit little-endian integer. */
  int16(value: number): this;
  /** Writes an unsigned 32-bit little-endian integer. */
  uint32(value: number): this;
  /** Writes a signed 32-bit little-endian integer. */
  int32(value: number): this;
  /** Writes an unsigned 64-bit little-endian integer. */
  uint64(value: bigint): this;
  /** Writes a 32-bit little-endian float. */
  float32(value: number): this;
  /** Writes a 64-bit little-endian float. */
  float64(value: number): this;
}

/**
 * Standard plugin type.
 *
 * Use this type as a type-only dependency when authoring plugins that call
 * methods such as `bytes()`, `uint32()`, or `string()` in their implementation.
 */
export type StandardPlugin = BytePlugin<
  StandardReaderMethods,
  StandardWriterMethods,
  StandardAllocMethods
>;

const bigint_to_uint8array = (value: bigint): Uint8Array => {
  const byteLength = Math.ceil(value.toString(2).length / 8);
  const bytes = new Uint8Array(byteLength);

  for (let i = 0; i < byteLength; i++) {
    bytes[byteLength - i - 1] = Number((value >> BigInt(i * 8)) & BigInt(0xff));
  }

  return bytes;
};

const uint8array_to_bigint = (bytes: Uint8Array): bigint => {
  let hex = '0x';

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }

  return BigInt(hex);
};

const STANDARD_PLUGIN: StandardPlugin = create_byte_plugin()({
  reader: {
    uint8(): number {
      const value = this.view.getUint8(this.offset);
      this.offset++;
      return value;
    },
    int8(): number {
      const value = this.view.getInt8(this.offset);
      this.offset++;
      return value;
    },
    uint16(): number {
      const value = this.view.getUint16(this.offset, true);
      this.offset += 2;
      return value;
    },
    int16(): number {
      const value = this.view.getInt16(this.offset, true);
      this.offset += 2;
      return value;
    },
    uint32(): number {
      const value = this.view.getUint32(this.offset, true);
      this.offset += 4;
      return value;
    },
    int32(): number {
      const value = this.view.getInt32(this.offset, true);
      this.offset += 4;
      return value;
    },
    uint64(): bigint {
      const value = this.view.getBigUint64(this.offset, true);
      this.offset += 8;
      return value;
    },
    float32(): number {
      const value = this.view.getFloat32(this.offset, true);
      this.offset += 4;
      return value;
    },
    float64(): number {
      const value = this.view.getFloat64(this.offset, true);
      this.offset += 8;
      return value;
    },
    bool(): boolean {
      return this.uint8() === 1;
    },
    string(): string {
      let value = '';
      let byte: number;

      while ((byte = this.uint8()) !== 0) {
        value += String.fromCharCode(byte);
      }

      return decodeURIComponent(value);
    },
    bigint(): bigint {
      return uint8array_to_bigint(this.n_bytes(this.uint16()));
    },
    bytes(): Uint8Array {
      return this.n_bytes(this.uint32());
    },
  },
  writer: {
    uint8(value: number): typeof this {
      this.alloc(1, (writer) => writer.uint8(value));
      return this;
    },
    int8(value: number): typeof this {
      this.alloc(1, (writer) => writer.int8(value));
      return this;
    },
    uint16(value: number): typeof this {
      this.alloc(2, (writer) => writer.uint16(value));
      return this;
    },
    int16(value: number): typeof this {
      this.alloc(2, (writer) => writer.int16(value));
      return this;
    },
    uint32(value: number): typeof this {
      this.alloc(4, (writer) => writer.uint32(value));
      return this;
    },
    int32(value: number): typeof this {
      this.alloc(4, (writer) => writer.int32(value));
      return this;
    },
    uint64(value: bigint): typeof this {
      this.alloc(8, (writer) => writer.uint64(value));
      return this;
    },
    float32(value: number): typeof this {
      this.alloc(4, (writer) => writer.float32(value));
      return this;
    },
    float64(value: number): typeof this {
      this.alloc(8, (writer) => writer.float64(value));
      return this;
    },
    bool(value: boolean): typeof this {
      return this.uint8(value ? 1 : 0);
    },
    string(value: string): typeof this {
      const escapedValue = encodeURIComponent(value);

      for (let i = 0; i < escapedValue.length; i++) {
        this.uint8(escapedValue.charCodeAt(i));
      }

      this.uint8(0);
      return this;
    },
    bigint(value: bigint): typeof this {
      const bytes = bigint_to_uint8array(value);
      this.uint16(bytes.byteLength);
      this.add(bytes);
      return this;
    },
    bytes(bytes: Uint8Array): typeof this {
      this.uint32(bytes.byteLength);
      this.add(bytes);
      return this;
    },
  },
  alloc: {
    int8(value: number): typeof this {
      this.view.setInt8(this.offset, value);
      this.offset++;
      return this;
    },
    uint16(value: number): typeof this {
      this.view.setUint16(this.offset, value, true);
      this.offset += 2;
      return this;
    },
    int16(value: number): typeof this {
      this.view.setInt16(this.offset, value, true);
      this.offset += 2;
      return this;
    },
    uint32(value: number): typeof this {
      this.view.setUint32(this.offset, value, true);
      this.offset += 4;
      return this;
    },
    int32(value: number): typeof this {
      this.view.setInt32(this.offset, value, true);
      this.offset += 4;
      return this;
    },
    uint64(value: bigint): typeof this {
      this.view.setBigUint64(this.offset, value, true);
      this.offset += 8;
      return this;
    },
    float32(value: number): typeof this {
      this.view.setFloat32(this.offset, value, true);
      this.offset += 4;
      return this;
    },
    float64(value: number): typeof this {
      this.view.setFloat64(this.offset, value, true);
      this.offset += 8;
      return this;
    },
  },
});

/**
 * Creates the standard primitive and framed byte codec plugin.
 *
 * The returned plugin is a singleton because it has no configuration and no
 * mutable state. It is safe to call this function wherever you build a
 * protocol.
 */
export function create_standard_plugin(): StandardPlugin {
  return STANDARD_PLUGIN;
}
