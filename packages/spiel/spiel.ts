/**
 * Template tag that gives source line breaks markdown semantics.
 *
 * @module
 */

/**
 * Options controlling how a literal is folded back into a string.
 */
export interface SpielOptions {
  /** Replacement for a single soft line break. Defaults to `' '`; use `''` for CJK or split URLs. */
  join?: string;
  /** Separator inserted between paragraphs. Defaults to `'\n\n'`. */
  paragraph?: string;
  /** Recognize markdown block markers and fences. Defaults to `true`. */
  markdown?: boolean;
  /**
   * Characters recognized as bullet list markers. Defaults to `'-'`; pass `'-*+'` for the full
   * CommonMark set, or `''` to recognize no bullets at all.
   */
  bullets?: string;
}

/**
 * Callable produced by {@linkcode spiel.withOptions}: usable both as a template tag and as a plain
 * function over an already built string.
 */
export interface Spiel {
  /** Formats a template literal, treating single source line breaks as soft wraps. */
  (strings: TemplateStringsArray, ...values: unknown[]): string;
  /** Formats a plain string. Raw text is unavailable, so every `\n` is a soft wrap. */
  (input: string): string;
  /** Returns a new tag with the given options merged over the current ones. */
  withOptions(options: SpielOptions): Spiel;
}

type ResolvedOptions = Required<SpielOptions>;

const DEFAULTS: ResolvedOptions = { join: ' ', paragraph: '\n\n', markdown: true, bullets: '-' };

/** Characters that need escaping inside a regular expression character class. */
const CLASS_UNSAFE = /[\\\]^-]/g;

/**
 * Builds the block marker pattern for a bullet set. Only bullets are configurable: ordered lists,
 * headings, quotes, tables and fences never collide with prose.
 */
function blockPattern(bullets: string): RegExp {
  const bullet = bullets === '' ? '' : `[${bullets.replace(CLASS_UNSAFE, '\\$&')}] |`;
  return new RegExp(`^(?:${bullet}\\d+[.)] |#{1,6} |> |\\||\`\`\`|~~~)`);
}
/** ATX headings cannot span lines, so nothing may be folded into them. */
const HEADING = /^#{1,6} /;
const FENCE = /^(```+|~~~+)/;
const INDENT = /^[ \t]*/;
const TRIM_START = /^[ \t]+/;
const TRIM_END = /[ \t]+$/;
const BLANK = /^[ \t]*$/;

const SIMPLE_ESCAPES: Record<string, string> = {
  '0': '\0',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
};

/** Strips spaces and tabs from both ends, leaving every other character alone. */
function trimSpaces(value: string): string {
  return value.replace(TRIM_START, '').replace(TRIM_END, '');
}

/** Strips trailing spaces and tabs. */
function trimEndSpaces(value: string): string {
  return value.replace(TRIM_END, '');
}

/** Private use ranges scanned for sentinels, in order. */
const PRIVATE_USE = [[0xe000, 0xf8ff], [0xf0000, 0xffffd], [0x100000, 0x10fffd]];

/**
 * Picks `count` characters from the private use area that do not occur in `text`, so they can act
 * as collision-free markers while the literal is being folded.
 */
function pickSentinels(text: string, count: number): string[] {
  const sentinels: string[] = [];
  for (const [from, to] of PRIVATE_USE) {
    for (let code = from; sentinels.length < count && code <= to; code++) {
      const char = String.fromCodePoint(code);
      if (!text.includes(char)) sentinels.push(char);
    }
    if (sentinels.length === count) return sentinels;
  }
  throw new RangeError('spiel: the literal occupies every private use character');
}

/**
 * Converts the escape sequences of a raw template chunk into their values. Typed `\n` and line
 * continuations become `hard`, a marker that survives the folding pass as a real line break. A
 * continuation keeps its `\n` so the following line still takes part in dedenting; a typed `\n`
 * does not, so spaces typed after it stay literal.
 */
function unescape(raw: string, hard: string): string {
  let out = '';
  let index = 0;
  while (index < raw.length) {
    const char = raw[index];
    if (char !== '\\') {
      out += char;
      index += 1;
      continue;
    }
    const next = raw[index + 1];
    if (next === undefined) {
      out += '\\';
      break;
    }
    index += 2;
    if (next === '\n') {
      out += hard + '\n';
    } else if (next === 'n') {
      out += hard;
    } else if (next === 'x') {
      const digits = raw.slice(index, index + 2);
      if (/^[0-9a-fA-F]{2}$/.test(digits)) {
        out += String.fromCharCode(parseInt(digits, 16));
        index += 2;
      } else {
        out += next;
      }
    } else if (next === 'u') {
      const braced = /^\{([0-9a-fA-F]{1,6})\}/.exec(raw.slice(index));
      const fixed = /^[0-9a-fA-F]{4}/.exec(raw.slice(index));
      if (braced && Number.parseInt(braced[1], 16) <= 0x10ffff) {
        out += String.fromCodePoint(Number.parseInt(braced[1], 16));
        index += braced[0].length;
      } else if (fixed) {
        out += String.fromCharCode(Number.parseInt(fixed[0], 16));
        index += 4;
      } else {
        out += next;
      }
    } else {
      out += SIMPLE_ESCAPES[next] ?? next;
    }
  }
  return out;
}

/** Removes the common indent of all non-blank lines, then drops blank lines at both ends. */
function dedent(text: string): string[] {
  const lines = text.split('\n');
  let common = Infinity;
  for (const line of lines) {
    if (BLANK.test(line)) continue;
    common = Math.min(common, INDENT.exec(line)![0].length);
  }
  if (common === Infinity) common = 0;

  const dedented = lines.map((line) => line.slice(common));
  let start = 0;
  let end = dedented.length;
  while (start < end && BLANK.test(dedented[start])) start += 1;
  while (end > start && BLANK.test(dedented[end - 1])) end -= 1;
  return dedented.slice(start, end);
}

interface Chunk {
  text: string;
  /** Fence chunks are closed: no following line may be folded into them. */
  sealed: boolean;
}

/** Collects a fence starting at `start`, returning the raw lines and the index just past it. */
function readFence(lines: string[], start: number, marker: string): [string[], number] {
  const collected = [trimEndSpaces(lines[start])];
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index];
    collected.push(line);
    index += 1;
    const closing = FENCE.exec(trimSpaces(line));
    if (closing && closing[1][0] === marker[0] && closing[1].length >= marker.length) break;
  }
  return [collected, index];
}

/** Folds dedented lines into paragraphs of block chunks and joins everything back together. */
function fold(lines: string[], options: ResolvedOptions, hard: string, block: RegExp): string {
  const paragraphs: string[] = [];
  let chunks: Chunk[] = [];

  const flush = () => {
    if (chunks.length === 0) return;
    paragraphs.push(chunks.map((chunk) => chunk.text).join('\n'));
    chunks = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (BLANK.test(line)) {
      flush();
      index += 1;
      continue;
    }

    const body = trimSpaces(line);
    const fence = options.markdown ? FENCE.exec(body) : null;
    if (fence) {
      const [collected, next] = readFence(lines, index, fence[1]);
      chunks.push({ text: collected.join('\n'), sealed: true });
      index = next;
      continue;
    }

    const isBlock = options.markdown && block.test(body);
    const previous = chunks.at(-1);
    if (previous && !previous.sealed && !isBlock) {
      const glue = previous.text.endsWith(hard) || body.startsWith(hard) ? '' : options.join;
      // Every chunk is seeded and extended with right-trimmed text, so no trim is needed here —
      // which keeps folding a long paragraph linear instead of rescanning it on every line.
      previous.text += glue + body;
    } else {
      chunks.push({
        text: isBlock ? trimEndSpaces(line) : body,
        sealed: options.markdown && HEADING.test(body),
      });
    }
    index += 1;
  }
  flush();

  return paragraphs.join(options.paragraph);
}

/** Runs the whole pipeline over one already assembled source text. */
function render(text: string, options: ResolvedOptions, hard: string, block: RegExp): string {
  return fold(dedent(text.replace(/\r\n/g, '\n')), options, hard, block);
}

function create(options: ResolvedOptions): Spiel {
  // Built once per tag rather than per call: the bullet set only changes through `withOptions`.
  const block = blockPattern(options.bullets);
  const tag = (
    first: TemplateStringsArray | string,
    ...values: unknown[]
  ): string => {
    if (typeof first === 'string') {
      const [hard] = pickSentinels(first, 1);
      return render(first, options, hard, block).replaceAll(hard, '\n');
    }

    const raws = first.raw;
    const [slot, hard] = pickSentinels(raws.join(''), 2);
    let source = '';
    for (let index = 0; index < raws.length; index++) {
      source += unescape(raws[index].replace(/\r\n/g, '\n'), hard);
      if (index < values.length) source += slot;
    }

    // Folding never adds or drops a slot, so `parts` always has exactly one more entry than
    // `values` and the initial-value-free reduce is safe even with no substitutions at all.
    const parts = render(source, options, hard, block).replaceAll(hard, '\n').split(slot);
    return parts.reduce(
      (acc, part, index) => acc + String(values[index - 1]) + part,
    );
  };

  tag.withOptions = (overrides: SpielOptions): Spiel => create({ ...options, ...overrides });
  return tag as Spiel;
}

/**
 * Formats a template literal the way markdown treats line breaks: single line breaks in the source
 * collapse into `join`, blank lines separate paragraphs, and markdown block lines keep their own
 * line. The common indent of the literal is removed.
 *
 * A typed `\n` (as opposed to a pressed Enter) produces a hard line break that survives folding;
 * this distinction is unavailable in the `spiel('...')` form, where every `\n` is soft.
 *
 * @example
 * ```ts
 * import { spiel } from '@wire/spiel';
 *
 * const prompt = spiel`
 *   Answer briefly and to the point, without
 *   introductions.
 *
 *   If you do not know the answer, say so.
 * `;
 * // 'Answer briefly and to the point, without introductions.\n\n
 * //  If you do not know the answer, say so.'
 * ```
 */
export const spiel: Spiel = create(DEFAULTS);
