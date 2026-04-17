import type { UnitOfWork, UnitOfWorkScope, UowTx } from '../uow.ts';

/**
 * Connector that lazily spawns and caches a transaction in the active unit of work.
 *
 * The connector uses itself as transaction id inside `UnitOfWork`, so each connector
 * instance resolves to at most one transaction per scope/cast.
 */
export class SpawnableConnector<Session> {
  constructor(
    /**
     * Scope used to resolve the active unit of work.
     */
    public readonly scope: UnitOfWorkScope,
    private readonly spawn: (uow: UnitOfWork) => Promise<UowTx<Session>>,
  ) {}

  /**
   * Returns current session if the connector was already selected in this scope.
   */
  find(): Session | undefined {
    return this.scope.get()?.find<Session>(this)?.session;
  }

  /**
   * Returns current session or throws if connector is not selected yet.
   */
  get(): Session {
    const session = this.find();
    if (session === undefined) {
      throw new Error('SpawnableConnector session not found. Call select() first.');
    }
    return session;
  }

  /**
   * Returns existing session or spawns/registers a new transaction in the active unit of work.
   */
  async select(): Promise<Session> {
    const uow = this.scope.get();
    let tx = uow.find<Session>(this);

    if (tx === undefined) {
      tx = await this.spawn(uow);
      uow.set(this, tx);
    }

    return tx.session;
  }
}
