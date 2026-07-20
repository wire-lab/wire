/**
 * @module
 *
 * Template tag with markdown line-break semantics: single line breaks in the source are cosmetic
 * and collapse into a space, blank lines separate paragraphs, and markdown block lines keep their
 * own line. The common indent of the literal is removed.
 *
 * ```ts
 * import { spiel } from '@wire/spiel';
 *
 * const help = spiel`
 *   Usage: wire <command> [options]. Commands are matched by
 *   prefix.
 *
 *   - build — compile the project
 *   - watch — rebuild on change
 * `;
 * ```
 */
export { spiel } from './spiel.ts';
export type { Spiel, SpielOptions } from './spiel.ts';
