/**
 * @module
 *
 * Strict base64url codec plugin for byte IO.
 *
 * The codec is intentionally stricter than generic base64url helpers: encoded
 * strings must be complete 4-character groups and decoded bytes must be
 * complete 3-byte groups. No padding is accepted or emitted.
 *
 * The plugin depends on the standard plugin at the type level because it reads
 * and writes framed byte arrays through `bytes()`. Callers must install the
 * standard plugin before this plugin when composing classes with
 * `ByteIo.create_io()`.
 */
import { create_byte_plugin } from '../byte-io.ts';
import type { BytePlugin } from '../byte-io.ts';
import type { StandardPlugin } from './standard.ts';

const DEFAULT_BASE64URL_SPACE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Reader methods installed by a strict base64url plugin. */
export interface B64uReaderMethods {
  /** Reads framed bytes and encodes them as a no-padding base64url string. */
  b64u(): string;
}

/** Writer methods installed by a strict base64url plugin. */
export interface B64uWriterMethods {
  /** Decodes strict base64url and writes the bytes with a `uint32` length prefix. */
  b64u(value: string): this;
}

/** Strict base64url plugin type. */
export type B64uPlugin = BytePlugin<B64uReaderMethods, B64uWriterMethods>;

const assert_base64url_space = (space: string): void => {
  if (space.length !== 64) {
    throw new RangeError('Base64url space must contain exactly 64 characters.');
  }

  if (new Set(space).size !== space.length) {
    throw new RangeError('Base64url space must not contain duplicate characters.');
  }
};

const uint8array_to_base64url = (bytes: Uint8Array, space: string): string => {
  if (bytes.byteLength % 3 !== 0) {
    throw new RangeError('Strict base64url encoding requires a byte length divisible by 3.');
  }

  let value = '';

  for (let i = 0; i < bytes.byteLength; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    value += space[(chunk >> 18) & 63];
    value += space[(chunk >> 12) & 63];
    value += space[(chunk >> 6) & 63];
    value += space[chunk & 63];
  }

  return value;
};

const base64url_to_uint8array = (value: string, space: string): Uint8Array => {
  if (value.length % 4 !== 0) {
    throw new RangeError('Strict base64url decoding requires a string length divisible by 4.');
  }

  const indexes = new Map<string, number>();

  for (let i = 0; i < space.length; i++) {
    indexes.set(space[i], i);
  }

  const bytes = new Uint8Array((value.length / 4) * 3);
  let byteOffset = 0;

  for (let i = 0; i < value.length; i += 4) {
    const first = indexes.get(value[i]);
    const second = indexes.get(value[i + 1]);
    const third = indexes.get(value[i + 2]);
    const fourth = indexes.get(value[i + 3]);

    if (
      first === undefined || second === undefined || third === undefined || fourth === undefined
    ) {
      throw new RangeError('Strict base64url value contains a character outside the space.');
    }

    const chunk = (first << 18) | (second << 12) | (third << 6) | fourth;
    bytes[byteOffset++] = (chunk >> 16) & 0xff;
    bytes[byteOffset++] = (chunk >> 8) & 0xff;
    bytes[byteOffset++] = chunk & 0xff;
  }

  return bytes;
};

/**
 * Creates a strict base64url plugin using the provided 64-character space.
 *
 * The default space is the URL-safe alphabet
 * `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_`.
 *
 * @param space A 64-character alphabet used for encoding and decoding.
 * @throws {RangeError} If `space` does not contain exactly 64 unique
 * characters.
 */
export function create_b64u_plugin(space: string = DEFAULT_BASE64URL_SPACE): B64uPlugin {
  assert_base64url_space(space);

  return create_byte_plugin<[StandardPlugin]>()({
    reader: {
      b64u(): string {
        return uint8array_to_base64url(this.bytes(), space);
      },
    },
    writer: {
      b64u(value: string): typeof this {
        this.bytes(base64url_to_uint8array(value, space));
        return this;
      },
    },
  });
}
