/**
 * Utilities for coordinating multiple transactional resources in a single unit of work.
 *
 * @module
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Utility type that accepts both synchronous and asynchronous return values.
 */
export type OrPromise<T> = T | Promise<T>;

/**
 * Callback executed after all transactions are successfully committed.
 */
export type AfterCommitListener = () => void;

/**
 * Mutable set of listeners fired after `UnitOfWork.commit()` completes.
 *
 * @example
 * ```typescript
 * import { AfterCommitTarget } from 'jsr:@wire/uow';
 *
 * const listeners = new AfterCommitTarget();
 * listeners.add(() => console.log('Committed'));
 * listeners.emit();
 * ```
 */
export class AfterCommitTarget extends Set<AfterCommitListener> {
  /**
   * Synchronously invokes every listener in insertion order.
   */
  emit(): void {
    for (const listener of this.values()) {
      listener();
    }
  }
}

/**
 * Controls for a resource-specific transaction lifecycle.
 */
export type UowTxControls = {
  /**
   * Commits the resource transaction.
   */
  commit: () => Promise<void>;
  /**
   * Rolls back the resource transaction.
   */
  rollback: () => Promise<void>;
};

/**
 * Transaction registered inside a unit of work.
 */
export type UowTx<Session> = {
  /**
   * Resource session or client used by application code.
   */
  session: Session;
  /**
   * Lifecycle controls for that resource transaction.
   */
  cycle: UowTxControls;
};

/**
 * Thrown when `UnitOfWork.get()` cannot resolve a transaction by identifier.
 */
export class TransactionNotFoundError extends Error {
  /**
   * Creates an error containing the unresolved transaction id.
   */
  constructor(id: unknown) {
    super(`Transaction not found for id: ${String(id)}`);
    this.name = 'TransactionNotFoundError';
  }
}

/**
 * Thrown when `UnitOfWorkScope.get()` is called outside of an active scope.
 */
export class UnitOfWorkNotFoundError extends Error {
  constructor() {
    super('UnitOfWork not found in the current async context');
    this.name = 'UnitOfWorkNotFoundError';
  }
}

/**
 * Policy used when `commit()` fails in `UnitOfWorkScope.cast()`.
 *
 * - `safeRollback` (default): attempt rollback before rethrowing commit error.
 * - `legacyBestEffort`: rethrow commit error without rollback attempt.
 */
export type CommitFailurePolicy = 'safeRollback' | 'legacyBestEffort';

/**
 * Options for `UnitOfWorkScope`.
 */
export type UnitOfWorkScopeOptions = {
  /**
   * Strategy used when `UnitOfWork.commit()` fails after business logic succeeds.
   *
   * @default {'safeRollback'}
   */
  commitFailurePolicy?: CommitFailurePolicy;
};

/**
 * Stores multiple resource transactions and executes them as one logical unit.
 *
 * @example
 * ```typescript
 * import { UnitOfWork } from 'jsr:@wire/uow';
 *
 * const uow = new UnitOfWork();
 * uow.set('postgres', {
 *   session: { txId: 'pg-1' },
 *   cycle: { commit: async () => {}, rollback: async () => {} },
 * });
 *
 * await uow.commit();
 * ```
 */
export class UnitOfWork {
  /**
   * Listeners emitted after a successful commit of all registered transactions.
   */
  readonly afterCommit: AfterCommitTarget = new AfterCommitTarget();

  private readonly map = new Map<unknown, UowTx<unknown>>();

  /**
   * Registers or replaces a transaction by identifier.
   */
  set<Session>(id: unknown, tx: UowTx<Session>): void {
    this.map.set(id, tx as UowTx<unknown>);
  }

  /**
   * Returns a transaction if present.
   */
  find<Session>(id: unknown): UowTx<Session> | undefined {
    return this.map.get(id) as UowTx<Session> | undefined;
  }

  /**
   * Returns a transaction by identifier or throws when not found.
   *
   * @throws {TransactionNotFoundError}
   */
  get<Session>(id: unknown): UowTx<Session> {
    const tx = this.find<Session>(id);
    if (!tx) {
      throw new TransactionNotFoundError(id);
    }
    return tx;
  }

  /**
   * Sequentially commits all registered transactions.
   *
   * If any commit fails, subsequent transactions are not committed and the error is rethrown.
   */
  async commit(): Promise<void> {
    for (const tx of this.map.values()) {
      await tx.cycle.commit();
    }
    this.afterCommit.emit();
  }

  /**
   * Sequentially rolls back all registered transactions.
   *
   * If any rollback fails, subsequent transactions are not rolled back and the error is rethrown.
   */
  async rollback(): Promise<void> {
    for (const tx of this.map.values()) {
      await tx.cycle.rollback();
    }
  }
}

/**
 * Async-context scope that exposes the active `UnitOfWork` without explicit parameter threading.
 *
 * @example
 * ```typescript
 * import { UnitOfWorkScope } from 'jsr:@wire/uow';
 *
 * const scope = new UnitOfWorkScope();
 * await scope.cast(async (uow) => {
 *   uow.set('mongo', {
 *     session: { id: 'm-1' },
 *     cycle: { commit: async () => {}, rollback: async () => {} },
 *   });
 * });
 * ```
 */
export class UnitOfWorkScope {
  private readonly storage = new AsyncLocalStorage<UnitOfWork>();
  private readonly commitFailurePolicy: CommitFailurePolicy;

  /**
   * Creates a scope with optional commit failure policy.
   */
  constructor(options: UnitOfWorkScopeOptions = {}) {
    this.commitFailurePolicy = options.commitFailurePolicy ?? 'safeRollback';
  }

  /**
   * Returns the active unit of work in current async context.
   */
  find = (): UnitOfWork | undefined => this.storage.getStore();

  /**
   * Returns the active unit of work in current async context or throws.
   *
   * @throws {UnitOfWorkNotFoundError}
   */
  get = (): UnitOfWork => {
    const ctx = this.find();
    if (!ctx) {
      throw new UnitOfWorkNotFoundError();
    }
    return ctx;
  };

  /**
   * Creates a new unit of work for the callback lifetime.
   *
   * - If callback fails, rollback is attempted and original error is rethrown.
   * - If commit fails, behavior depends on `commitFailurePolicy`.
   */
  cast<T>(fn: (uow: UnitOfWork) => OrPromise<T>): Promise<T> {
    const ctx = new UnitOfWork();
    return this.storage.run(ctx, async () => {
      const result = await Promise.resolve()
        .then(() => fn(ctx))
        .catch((error) => this.rollbackAndRethrow(ctx, error));
      try {
        await ctx.commit();
      } catch (error) {
        if (this.commitFailurePolicy === 'safeRollback') {
          await this.rollbackAndRethrow(ctx, error);
        }
        throw error;
      }
      return result;
    });
  }

  /** @internal */
  private async rollbackAndRethrow(ctx: UnitOfWork, error: unknown): Promise<never> {
    try {
      await ctx.rollback();
    } catch (rollbackError) {
      throw new AggregateError(
        [asError(error), asError(rollbackError)],
        'Rollback failed while handling UnitOfWork error',
      );
    }
    throw error;
  }
}

function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}
