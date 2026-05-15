/**
 * Typed array inputs accepted by byte readers.
 *
 * `BaseReader` normalizes typed arrays to the exact byte range they expose,
 * so passing a sliced `Uint8Array` reads only that slice rather than the whole
 * backing buffer.
 */
export type ByteArray =
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Float32Array
  | Float64Array;

type AnyMethod = (...args: any[]) => unknown;

/**
 * Object-shaped method bag installed by a byte IO plugin.
 *
 * Plugins are plain objects whose properties are methods. The method names are
 * copied onto generated reader, writer, or allocation-writer prototypes.
 */
export type PluginMethods = object;

/** Empty method bag used when a plugin does not provide one side. */
export type EmptyPluginMethods = Record<never, never>;

/** Converts a union type into an intersection type for plugin method composition. */
export type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (
  value: infer Intersection,
) => void ? Intersection
  : never;

/** Converts a union of object types into an object intersection. */
export type ObjectIntersection<T> = UnionToIntersection<T> extends infer Intersection extends object
  ? Intersection
  : EmptyPluginMethods;

/** Extracts the reader method bag carried by a plugin type. */
export type ReaderMethodsOf<Plugin> = Plugin extends BytePlugin<
  infer ReaderMethods,
  PluginMethods,
  PluginMethods
> ? ReaderMethods
  : EmptyPluginMethods;

/** Extracts the writer method bag carried by a plugin type. */
export type WriterMethodsOf<Plugin> = Plugin extends BytePlugin<
  PluginMethods,
  infer WriterMethods,
  PluginMethods
> ? WriterMethods
  : EmptyPluginMethods;

/** Extracts the allocation-writer method bag carried by a plugin type. */
export type AllocMethodsOf<Plugin> = Plugin extends BytePlugin<
  PluginMethods,
  PluginMethods,
  infer AllocMethods
> ? AllocMethods
  : EmptyPluginMethods;

/** Reader methods composed from a plugin list. */
export type ReaderMethodsOfPlugins<Plugins extends readonly BytePlugin[]> = ObjectIntersection<
  ReaderMethodsOf<Plugins[number]>
>;

/** Writer methods composed from a plugin list. */
export type WriterMethodsOfPlugins<Plugins extends readonly BytePlugin[]> = ObjectIntersection<
  WriterMethodsOf<Plugins[number]>
>;

/** Allocation-writer methods composed from a plugin list. */
export type AllocMethodsOfPlugins<Plugins extends readonly BytePlugin[]> = ObjectIntersection<
  AllocMethodsOf<Plugins[number]>
>;

/**
 * Plugin descriptor carrying reader, writer, and allocation-writer methods.
 *
 * A plugin does not install runtime dependencies. If a plugin is written with
 * `ByteIo.create_plugin<[SomePlugin]>()`, that dependency is type-only and the
 * caller must still pass both plugins to {@linkcode ByteIo.create_io} in the
 * desired order.
 */
export type BytePlugin<
  ReaderMethods extends PluginMethods = EmptyPluginMethods,
  WriterMethods extends PluginMethods = EmptyPluginMethods,
  AllocMethods extends PluginMethods = EmptyPluginMethods,
> = {
  /** Methods installed on composed reader classes. */
  reader?: ReaderMethods;
  /** Methods installed on composed writer classes. */
  writer?: WriterMethods;
  /** Methods installed on composed allocation writer classes. */
  alloc?: AllocMethods;
};

/**
 * `this` type available inside allocation-writer plugin methods.
 *
 * It includes the base allocation writer, methods provided by type-only
 * dependencies, and methods declared by the current plugin's `alloc` section.
 */
export type AllocWriterContext<
  Deps extends readonly BytePlugin[],
  AllocMethods extends PluginMethods,
> = BaseAllocWriter & AllocMethodsOfPlugins<Deps> & AllocMethods;

/**
 * Callback used by writers to fill a fixed-size allocation writer.
 *
 * The callback receives the allocation writer associated with the composed
 * writer class. This allows plugin methods installed on `AllocWriter` to be
 * used inside `BaseWriter.alloc()`.
 */
export type WriterAllocCallback<AllocWriter extends BaseAllocWriter = BaseAllocWriter> = (
  writer: AllocWriter,
) => void | AllocWriter;

/**
 * `this` type available inside writer plugin methods.
 *
 * It models fluent chaining with the current plugin methods and the methods
 * from type-only dependencies. This is why `ByteIo.create_plugin<[Deps]>()` is
 * curried: dependencies are fixed first, then method bags are inferred from the
 * object literal passed to the second call.
 */
export type WriterContext<
  Deps extends readonly BytePlugin[],
  WriterMethods extends PluginMethods,
  AllocMethods extends PluginMethods,
> =
  & Omit<BaseWriter, 'alloc'>
  & WriterMethodsOfPlugins<Deps>
  & WriterMethods
  & {
    alloc(
      byteLength: number,
      cb: WriterAllocCallback<AllocWriterContext<Deps, AllocMethods>>,
    ): WriterContext<Deps, WriterMethods, AllocMethods>;
  };

/**
 * Shape accepted by {@linkcode ByteIo.create_plugin}.
 *
 * Each section is optional. Methods in `reader` are installed on generated
 * reader classes, methods in `writer` on generated writer classes, and methods
 * in `alloc` on generated allocation-writer classes.
 */
export type BytePluginDefinition<
  Deps extends readonly BytePlugin[],
  ReaderMethods extends PluginMethods,
  WriterMethods extends PluginMethods,
  AllocMethods extends PluginMethods,
> = {
  /** Reader methods with a dependency-aware `this` type. */
  reader?: ReaderMethods & ThisType<BaseReader & ReaderMethodsOfPlugins<Deps> & ReaderMethods>;
  /** Writer methods with a dependency-aware `this` type. */
  writer?: WriterMethods & ThisType<WriterContext<Deps, WriterMethods, AllocMethods>>;
  /** Allocation writer methods with a dependency-aware `this` type. */
  alloc?: AllocMethods & ThisType<AllocWriterContext<Deps, AllocMethods>>;
};

/** Function type for creating byte IO plugin descriptors. */
export type CreatePlugin = <const Deps extends readonly BytePlugin[] = readonly []>() => <
  const ReaderMethods extends PluginMethods = EmptyPluginMethods,
  const WriterMethods extends PluginMethods = EmptyPluginMethods,
  const AllocMethods extends PluginMethods = EmptyPluginMethods,
>(
  plugin: BytePluginDefinition<Deps, ReaderMethods, WriterMethods, AllocMethods>,
) => BytePlugin<ReaderMethods, WriterMethods, AllocMethods>;

/**
 * Creates a plugin factory with type-only dependency requirements.
 *
 * Use the optional generic tuple to describe methods that must already be
 * available when authoring this plugin:
 *
 * ```ts ignore
 * const plugin = ByteIo.create_plugin<[StandardPlugin]>()({
 *   writer: {
 *     custom(value: Uint8Array): typeof this {
 *       this.bytes(value);
 *       return this;
 *     },
 *   },
 * });
 * ```
 *
 * The dependency tuple is not used at runtime. Callers must pass dependencies
 * explicitly to {@linkcode ByteIo.create_io}, for example
 * `[create_standard_plugin(), plugin]`.
 */
export function create_byte_plugin<const Deps extends readonly BytePlugin[] = readonly []>(): <
  const ReaderMethods extends PluginMethods = EmptyPluginMethods,
  const WriterMethods extends PluginMethods = EmptyPluginMethods,
  const AllocMethods extends PluginMethods = EmptyPluginMethods,
>(
  plugin: BytePluginDefinition<Deps, ReaderMethods, WriterMethods, AllocMethods>,
) => BytePlugin<ReaderMethods, WriterMethods, AllocMethods> {
  return <
    const ReaderMethods extends PluginMethods = EmptyPluginMethods,
    const WriterMethods extends PluginMethods = EmptyPluginMethods,
    const AllocMethods extends PluginMethods = EmptyPluginMethods,
  >(
    plugin: BytePluginDefinition<Deps, ReaderMethods, WriterMethods, AllocMethods>,
  ): BytePlugin<ReaderMethods, WriterMethods, AllocMethods> =>
    plugin as BytePlugin<ReaderMethods, WriterMethods, AllocMethods>;
}

const concat_uint8arrays = (buffers: Uint8Array[]): Uint8Array => {
  const totalLength = buffers.reduce((acc, buffer) => acc + buffer.byteLength, 0);
  const combinedBuffer = new Uint8Array(totalLength);

  let offset = 0;
  for (const buffer of buffers) {
    combinedBuffer.set(buffer, offset);
    offset += buffer.byteLength;
  }

  return combinedBuffer;
};

const normalize_data = (data: ArrayBuffer | ByteArray): ArrayBuffer => {
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
};

const install_methods = (target: object, methodGroups: Array<PluginMethods | undefined>): void => {
  for (const methods of methodGroups) {
    if (!methods) continue;

    for (const [name, method] of Object.entries(methods) as Array<[string, AnyMethod]>) {
      Object.defineProperty(target, name, {
        configurable: true,
        value: method,
        writable: true,
      });
    }
  }
};

/**
 * Base byte reader extended by plugin-composed reader classes.
 *
 * The reader owns a `DataView` and an `offset`. Plugin reader methods are
 * expected to read from `view` at the current `offset`, advance the offset by
 * the number of consumed bytes, and return decoded values.
 */
export class BaseReader {
  /** Buffer read by this reader. */
  public readonly data: ArrayBuffer;
  /** DataView over {@linkcode data}. */
  public readonly view: DataView;
  /** Current read offset in bytes. */
  public offset: number;

  /**
   * Creates a reader over an `ArrayBuffer` or typed array.
   *
   * Typed arrays are normalized to their visible byte range, which makes sliced
   * arrays safe to pass without accidentally exposing adjacent bytes from the
   * same backing buffer.
   */
  constructor(data: ArrayBuffer | ByteArray, offset = 0) {
    this.data = normalize_data(data);
    this.view = new DataView(this.data);
    this.offset = offset;
  }

  /** Total byte length of the underlying buffer. */
  get length(): number {
    return this.view.byteLength;
  }

  /**
   * Advances the current read offset.
   *
   * This does not bounds-check. Protocol methods should only skip data whose
   * length has already been validated by the protocol.
   */
  skip(count: number): this {
    this.offset += count;
    return this;
  }

  /**
   * Reads a fixed number of raw bytes without interpreting a length prefix.
   *
   * The returned `Uint8Array` is copied, so subsequent reads do not mutate the
   * returned value.
   */
  n_bytes(byteLength: number): Uint8Array {
    const bytes = new Uint8Array(this.data, this.offset, byteLength);
    this.offset += byteLength;
    return new Uint8Array(bytes);
  }

  /**
   * Runs a callback with this reader and returns the reader.
   *
   * This is useful for reusable validation or parsing steps that should advance
   * the mutable reader and keep the fluent chain alive. The callback may return
   * this reader or `void`.
   */
  apply(fn: (reader: this) => this | void): this {
    return fn(this) ?? this;
  }

  /** Whether the reader has consumed the whole buffer. */
  get complete(): boolean {
    return this.offset === this.length;
  }

  /** Whether unread bytes remain. */
  get incomplete(): boolean {
    return !this.complete;
  }

  /** Clones this reader at its current offset. */
  clone(): this {
    return new (this.constructor as typeof BaseReader)(this.data, this.offset) as this;
  }

  /** Returns all bytes after the current offset. */
  remaining(): Uint8Array {
    return new Uint8Array(this.data.slice(this.offset));
  }
}

/**
 * Base byte writer extended by plugin-composed writer classes.
 *
 * The base writer only knows how to append raw byte chunks, allocate fixed-size
 * byte regions, concatenate other writers, and compile the result. Framed
 * formats such as `bytes(bytes)` live in plugins.
 */
export class BaseWriter {
  /** Pending byte chunks appended to this writer. */
  protected readonly ops: Uint8Array[];

  /** Creates a writer from an optional list of byte chunks. */
  constructor(ops: Uint8Array[] = []) {
    this.ops = ops;
  }

  /**
   * Allocates a fixed-size buffer and appends the callback result.
   *
   * Allocation writers are useful for numeric codecs because they can write
   * directly into a `DataView` with explicit little-endian flags.
   */
  alloc(byteLength: number, cb: WriterAllocCallback): this {
    const writer = new BaseAllocWriter(byteLength);
    cb(writer);
    this.ops.push(writer.finish());
    return this;
  }

  /**
   * Appends raw bytes without a length prefix.
   *
   * This is the lowest-level append operation. Use the standard plugin's
   * `bytes(bytes)` method when the protocol should include a `uint32` length
   * prefix before the bytes.
   */
  add(bytes: Uint8Array): this {
    this.ops.push(bytes);
    return this;
  }

  /**
   * Runs a callback with this writer and returns the writer.
   *
   * This is the mutable equivalent of call helpers in fluent builders: the
   * callback can append bytes, call plugin methods, and optionally return the
   * same writer for chaining.
   */
  apply(fn: (writer: this) => this | void): this {
    return fn(this) ?? this;
  }

  /** Appends another writer's compiled bytes. */
  concat(writer: BaseWriter): this {
    this.ops.push(writer.finish());
    return this;
  }

  /**
   * Merges pending chunks into one chunk.
   *
   * Calling `finish()` also compiles automatically, so most consumers do not
   * need to call this directly.
   */
  compile(): this {
    if (this.ops.length > 1) {
      const compiled = concat_uint8arrays(this.ops);
      this.ops.length = 0;
      this.ops.push(compiled);
    }

    return this;
  }

  /** Clones this writer after compiling it. */
  clone(): this {
    return new (this.constructor as typeof BaseWriter)([...this.compile().ops]) as this;
  }

  /** Returns the compiled output bytes. */
  finish(): Uint8Array {
    this.compile();
    return this.ops[0] ?? new Uint8Array();
  }
}

/**
 * Fixed-size writer used inside {@linkcode BaseWriter.alloc}.
 *
 * Plugin allocation methods should write at `offset`, advance by the exact
 * number of bytes written, and return `this` for fluent use inside allocation
 * callbacks.
 */
export class BaseAllocWriter {
  /** Buffer being filled by this allocation writer. */
  public readonly data: ArrayBuffer;
  /** DataView over {@linkcode data}. */
  public readonly view: DataView;
  /** Current write offset in bytes. */
  public offset = 0;

  /** Creates an allocation writer for a fixed byte length. */
  constructor(byteLength: number) {
    this.data = new ArrayBuffer(byteLength);
    this.view = new DataView(this.data);
  }

  /** Writes raw bytes at the current offset without a length prefix. */
  add(bytes: Uint8Array): this {
    for (const byte of bytes) {
      this.uint8(byte);
    }

    return this;
  }

  /**
   * Runs a callback with this allocation writer and returns it.
   *
   * Use this to group fixed-size writes inside `BaseWriter.alloc()` callbacks
   * without breaking the mutable chain.
   */
  apply(fn: (writer: this) => this | void): this {
    return fn(this) ?? this;
  }

  /** Writes an unsigned 8-bit integer at the current offset. */
  uint8(value: number): this {
    this.view.setUint8(this.offset, value);
    this.offset++;
    return this;
  }

  /** Returns the written portion of the allocation buffer. */
  finish(): Uint8Array {
    return new Uint8Array(
      this.offset === this.data.byteLength ? this.data : this.data.slice(0, this.offset),
    );
  }
}

/** Instance type for a plugin-composed reader. */
export type ReaderInstance<ReaderMethods extends PluginMethods> =
  & ReaderMethods
  & {
    /** Buffer read by this reader. */
    readonly data: ArrayBuffer;
    /** DataView over the reader data. */
    readonly view: DataView;
    /** Current read offset in bytes. */
    offset: number;
    /** Total byte length of the underlying buffer. */
    readonly length: number;
    /** Whether the reader has consumed the whole buffer. */
    readonly complete: boolean;
    /** Whether unread bytes remain. */
    readonly incomplete: boolean;
    /** Advances the current read offset. */
    skip(count: number): ReaderInstance<ReaderMethods>;
    /** Reads a fixed number of raw bytes. */
    n_bytes(byteLength: number): Uint8Array;
    /** Runs a mutable callback and returns the reader. */
    apply(
      fn: (reader: ReaderInstance<ReaderMethods>) => ReaderInstance<ReaderMethods> | void,
    ): ReaderInstance<ReaderMethods>;
    /** Clones this reader at its current offset. */
    clone(): ReaderInstance<ReaderMethods>;
    /** Returns all bytes after the current offset. */
    remaining(): Uint8Array;
  };

/** Instance type for a plugin-composed allocation writer. */
export type AllocWriterInstance<AllocMethods extends PluginMethods> =
  & AllocMethods
  & {
    /** Buffer being filled by this allocation writer. */
    readonly data: ArrayBuffer;
    /** DataView over the allocation writer data. */
    readonly view: DataView;
    /** Current write offset in bytes. */
    offset: number;
    /** Writes raw bytes at the current offset without a length prefix. */
    add(bytes: Uint8Array): AllocWriterInstance<AllocMethods>;
    /** Runs a mutable callback and returns the allocation writer. */
    apply(
      fn: (writer: AllocWriterInstance<AllocMethods>) => AllocWriterInstance<AllocMethods> | void,
    ): AllocWriterInstance<AllocMethods>;
    /** Writes an unsigned 8-bit integer at the current offset. */
    uint8(value: number): AllocWriterInstance<AllocMethods>;
    /** Returns the written portion of the allocation buffer. */
    finish(): Uint8Array;
  };

/** Instance type for a plugin-composed writer. */
export type WriterInstance<
  WriterMethods extends PluginMethods,
  AllocMethods extends PluginMethods,
> =
  & WriterMethods
  & {
    /** Allocates a fixed-size composed allocation writer. */
    alloc(
      byteLength: number,
      cb: WriterAllocCallback<AllocWriterInstance<AllocMethods>>,
    ): WriterInstance<WriterMethods, AllocMethods>;
    /** Appends raw bytes without a length prefix. */
    add(bytes: Uint8Array): WriterInstance<WriterMethods, AllocMethods>;
    /** Runs a mutable callback and returns the writer. */
    apply(
      fn: (
        writer: WriterInstance<WriterMethods, AllocMethods>,
      ) => WriterInstance<WriterMethods, AllocMethods> | void,
    ): WriterInstance<WriterMethods, AllocMethods>;
    /** Appends another writer's compiled bytes. */
    concat(writer: BaseWriter): WriterInstance<WriterMethods, AllocMethods>;
    /** Merges pending chunks into one chunk. */
    compile(): WriterInstance<WriterMethods, AllocMethods>;
    /** Clones this writer after compiling it. */
    clone(): WriterInstance<WriterMethods, AllocMethods>;
    /** Returns the compiled output bytes. */
    finish(): Uint8Array;
  };

/** Constructor type for a plugin-composed reader class. */
export type ReaderConstructor<ReaderMethods extends PluginMethods> = {
  new (data: ArrayBuffer | ByteArray, offset?: number): ReaderInstance<ReaderMethods>;
};

/** Constructor type for a plugin-composed writer class. */
export type WriterConstructor<
  WriterMethods extends PluginMethods,
  AllocMethods extends PluginMethods,
> = {
  new (ops?: Uint8Array[]): WriterInstance<WriterMethods, AllocMethods>;
};

/** Constructor type for a plugin-composed allocation writer class. */
export type AllocWriterConstructor<AllocMethods extends PluginMethods> = {
  new (byteLength: number): AllocWriterInstance<AllocMethods>;
};

/** Instance type produced by a plugin-composed reader constructor. */
export type ReaderOf<TConstructor extends abstract new (...args: any[]) => unknown> = InstanceType<
  TConstructor
>;

/** Instance type produced by a plugin-composed writer constructor. */
export type WriterOf<TConstructor extends abstract new (...args: any[]) => unknown> = InstanceType<
  TConstructor
>;

/** Instance type produced by a plugin-composed allocation-writer constructor. */
export type AllocWriterOf<TConstructor extends abstract new (...args: any[]) => unknown> =
  InstanceType<TConstructor>;

/** Classes produced by {@linkcode ByteIo.create_io}. */
export type ByteIO<Plugins extends readonly BytePlugin[]> = {
  /** Reader class with all plugin reader methods installed. */
  Reader: ReaderConstructor<ReaderMethodsOfPlugins<Plugins>>;
  /** Writer class with all plugin writer methods installed. */
  Writer: WriterConstructor<WriterMethodsOfPlugins<Plugins>, AllocMethodsOfPlugins<Plugins>>;
  /** Allocation writer class with all plugin allocation methods installed. */
  AllocWriter: AllocWriterConstructor<AllocMethodsOfPlugins<Plugins>>;
};

/** Options for composing byte IO classes from plugins. */
export type CreateByteIOOptions<Plugins extends readonly BytePlugin[]> = {
  /** Plugins to install in order. Type-only dependencies are not installed automatically. */
  plugins: Plugins;
};

/** Function type for creating plugin-composed byte IO classes. */
export type CreateIo = <const Plugins extends readonly BytePlugin[]>(
  options: CreateByteIOOptions<Plugins>,
) => ByteIO<Plugins>;

/**
 * Creates plugin-composed reader, writer, and allocation-writer classes.
 *
 * Plugins are installed in the order provided. Type-only dependencies declared
 * with `ByteIo.create_plugin<[Deps]>()` are not installed automatically; this is
 * intentional so protocol composition remains explicit and predictable.
 *
 * ```ts ignore
 * const { Reader, Writer } = ByteIo.create_io({
 *   plugins: [create_standard_plugin(), create_b64u_plugin()],
 * });
 * ```
 */
export function create_byte_io<const Plugins extends readonly BytePlugin[]>(
  { plugins }: CreateByteIOOptions<Plugins>,
): ByteIO<Plugins> {
  class Reader extends BaseReader {}
  class AllocWriter extends BaseAllocWriter {}
  class Writer extends BaseWriter {
    override alloc(byteLength: number, cb: WriterAllocCallback): this {
      const writer = new AllocWriter(byteLength);
      cb(writer);
      this.ops.push(writer.finish());
      return this;
    }
  }

  install_methods(
    Reader.prototype,
    plugins.map((plugin) => plugin.reader),
  );
  install_methods(
    Writer.prototype,
    plugins.map((plugin) => plugin.writer),
  );
  install_methods(
    AllocWriter.prototype,
    plugins.map((plugin) => plugin.alloc),
  );

  return {
    AllocWriter,
    Reader,
    Writer,
  } as unknown as ByteIO<Plugins>;
}

/** Runtime facade for the public root API. */
export type ByteIoFacade = {
  /** Creates plugin-composed reader, writer, and allocation-writer classes. */
  create_io: CreateIo;
  /** Creates a byte IO plugin factory with type-only dependency requirements. */
  create_plugin: CreatePlugin;
  /** Base reader class used by composed readers. */
  BaseReader: typeof BaseReader;
  /** Base writer class used by composed writers. */
  BaseWriter: typeof BaseWriter;
  /** Base allocation-writer class used by composed allocation writers. */
  BaseAllocWriter: typeof BaseAllocWriter;
};

/** Zod-style namespace object for the root byte IO API. */
export const ByteIo: ByteIoFacade = {
  create_io: create_byte_io,
  create_plugin: create_byte_plugin,
  BaseReader,
  BaseWriter,
  BaseAllocWriter,
};

/** Grouped type helpers and aliases for the {@linkcode ByteIo} facade. */
// deno-lint-ignore no-namespace -- namespace merging gives users zod-like `ByteIo.ReaderOf` types.
export namespace ByteIo {
  /** Typed array inputs accepted by byte readers. */
  export type ByteArray =
    | Uint8Array
    | Uint16Array
    | Uint32Array
    | Int8Array
    | Int16Array
    | Int32Array
    | Float32Array
    | Float64Array;

  /** Object-shaped method bag installed by a byte IO plugin. */
  export type PluginMethods = object;

  /** Empty method bag used when a plugin does not provide one side. */
  export type EmptyPluginMethods = Record<never, never>;

  /** Plugin descriptor carrying reader, writer, and allocation-writer methods. */
  export type Plugin<
    ReaderMethods extends PluginMethods = EmptyPluginMethods,
    WriterMethods extends PluginMethods = EmptyPluginMethods,
    AllocMethods extends PluginMethods = EmptyPluginMethods,
  > = BytePlugin<ReaderMethods, WriterMethods, AllocMethods>;

  /** Reader methods composed from a plugin list. */
  export type ReaderMethods<Plugins extends readonly BytePlugin[]> = ReaderMethodsOfPlugins<
    Plugins
  >;

  /** Writer methods composed from a plugin list. */
  export type WriterMethods<Plugins extends readonly BytePlugin[]> = WriterMethodsOfPlugins<
    Plugins
  >;

  /** Allocation-writer methods composed from a plugin list. */
  export type AllocMethods<Plugins extends readonly BytePlugin[]> = AllocMethodsOfPlugins<
    Plugins
  >;

  /** Constructor type for a plugin-composed reader class. */
  export type ReaderInstance<ReaderMethods extends PluginMethods> =
    import('./byte-io.ts').ReaderInstance<ReaderMethods>;

  /** Constructor type for a plugin-composed reader class. */
  export type ReaderConstructor<ReaderMethods extends PluginMethods> = {
    new (data: ArrayBuffer | ByteArray, offset?: number): ReaderInstance<ReaderMethods>;
  };

  /** Instance type for a plugin-composed allocation writer. */
  export type AllocWriterInstance<AllocMethods extends PluginMethods> =
    import('./byte-io.ts').AllocWriterInstance<AllocMethods>;

  /** Instance type for a plugin-composed writer. */
  export type WriterInstance<
    WriterMethods extends PluginMethods,
    AllocMethods extends PluginMethods,
  > = import('./byte-io.ts').WriterInstance<WriterMethods, AllocMethods>;

  /** Constructor type for a plugin-composed writer class. */
  export type WriterConstructor<
    WriterMethods extends PluginMethods,
    AllocMethods extends PluginMethods,
  > = import('./byte-io.ts').WriterConstructor<WriterMethods, AllocMethods>;

  /** Constructor type for a plugin-composed allocation writer class. */
  export type AllocWriterConstructor<AllocMethods extends PluginMethods> = {
    new (byteLength: number): AllocWriterInstance<AllocMethods>;
  };

  /** Instance type produced by a plugin-composed reader constructor. */
  export type ReaderOf<TConstructor extends abstract new (...args: any[]) => unknown> =
    InstanceType<TConstructor>;

  /** Instance type produced by a plugin-composed writer constructor. */
  export type WriterOf<TConstructor extends abstract new (...args: any[]) => unknown> =
    InstanceType<TConstructor>;

  /** Instance type produced by a plugin-composed allocation-writer constructor. */
  export type AllocWriterOf<
    TConstructor extends abstract new (...args: any[]) => unknown,
  > = InstanceType<TConstructor>;

  /** Classes produced by {@linkcode ByteIo.create_io}. */
  export type IO<Plugins extends readonly BytePlugin[]> = ByteIO<Plugins>;

  /** Options for composing byte IO classes from plugins. */
  export type CreateOptions<Plugins extends readonly BytePlugin[]> = CreateByteIOOptions<Plugins>;

  /** `this` type available inside writer plugin methods. */
  export type WriterContext<
    Deps extends readonly BytePlugin[],
    WriterMethods extends PluginMethods,
    AllocMethods extends PluginMethods,
  > = import('./byte-io.ts').WriterContext<Deps, WriterMethods, AllocMethods>;

  /** `this` type available inside allocation-writer plugin methods. */
  export type AllocWriterContext<
    Deps extends readonly BytePlugin[],
    AllocMethods extends PluginMethods,
  > = import('./byte-io.ts').AllocWriterContext<Deps, AllocMethods>;
}
