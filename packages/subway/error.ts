
type Rsu = Record<string, unknown>;

export class LibError extends Error {
  private declare internal: Rsu;

  set_message(message: string): this {
    this.message = message;
    return this;
  }

  set_internal(internal: Rsu): this {
    this.internal = internal;
    return this;
  }
}