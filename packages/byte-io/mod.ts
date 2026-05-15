/**
 * @module
 *
 * Core plugin-composed byte reader and writer API.
 *
 * Import this entrypoint when you want to compose your own protocol from
 * plugins. The root module centers the `ByteIo` facade and also exposes
 * supporting type/class exports for documentation and advanced typing;
 * ready-made codecs live under explicit plugin subpaths such as
 * `@wire/byte-io/plugins/standard`.
 *
 * ```ts
 * import { ByteIo } from '@wire/byte-io';
 * import { create_standard_plugin } from '@wire/byte-io/plugins/standard';
 *
 * const { Reader: ByteReader, Writer: ByteWriter } = ByteIo.create_io({
 *   plugins: [create_standard_plugin()],
 * });
 *
 * const bytes = new ByteWriter().uint32(42).finish();
 * const value = new ByteReader(bytes).uint32();
 * ```
 */
export { BaseAllocWriter, BaseReader, BaseWriter, ByteIo } from './byte-io.ts';
export type {
  AllocMethodsOf,
  AllocMethodsOfPlugins,
  AllocWriterConstructor,
  AllocWriterContext,
  AllocWriterInstance,
  AllocWriterOf,
  ByteArray,
  ByteIO,
  ByteIoFacade,
  BytePlugin,
  BytePluginDefinition,
  CreateByteIOOptions,
  CreateIo,
  CreatePlugin,
  EmptyPluginMethods,
  ObjectIntersection,
  PluginMethods,
  ReaderConstructor,
  ReaderInstance,
  ReaderMethodsOf,
  ReaderMethodsOfPlugins,
  ReaderOf,
  UnionToIntersection,
  WriterAllocCallback,
  WriterConstructor,
  WriterContext,
  WriterInstance,
  WriterMethodsOf,
  WriterMethodsOfPlugins,
  WriterOf,
} from './byte-io.ts';
