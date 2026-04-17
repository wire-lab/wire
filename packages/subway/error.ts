/**
 * @module
 * Structured errors used by Subway when routing or configuration rules are violated.
 */

/** Arbitrary structured payload attached to a {@linkcode LibError} for diagnostics. */
export type LibErrorDetails = Record<string, unknown>;

/**
 * Base error for Subway internals; supports fluent attachment of a message and structured details.
 */
export class LibError extends Error {
  declare private internal: LibErrorDetails;

  /** Sets the human-readable error message. */
  set_message(message: string): this {
    this.message = message;
    return this;
  }

  /** Attaches structured diagnostic data (for example action keys or error codes). */
  set_internal(internal: LibErrorDetails): this {
    this.internal = internal;
    return this;
  }
}
