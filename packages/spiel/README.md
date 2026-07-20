# @wire/spiel

A template tag that gives source line breaks markdown semantics, so prose can be wrapped to fit the
editor without the wrapping leaking into the string.

- a **single line break** in the source is cosmetic — it collapses into a space;
- a **blank line** is meaningful — it separates paragraphs;
- **markdown block lines** (list items, headings, quotes, tables, fences) keep their own line;
- the **common indent** of the literal is removed, so the string is not polluted by code
  indentation.

Built for LLM prompts, CLI help, error messages and mail templates: anything written as prose inside
source code.

## The niche

|                                  | Indentation | Soft wraps | Paragraphs |
| -------------------------------- | ----------- | ---------- | ---------- |
| `dedent`, `outdent`, `ts-dedent` | stripped    | kept as is | kept       |
| `common-tags/oneLine`, `oneline` | stripped    | collapsed  | **lost**   |
| **spiel**                        | stripped    | collapsed  | kept       |

## Installation

```bash
deno add jsr:@wire/spiel
```

```ts
import { spiel } from '@wire/spiel';
```

## Usage

```ts
import { assertEquals } from 'jsr:@std/assert@0.205.0';
import { spiel } from '@wire/spiel';

const prompt = spiel`
  You are an assistant. Answer briefly and to the point, do
  not add preambles and do not ask follow-up questions when
  the request is clear.

  If you do not know the answer, say so.
`;

assertEquals(
  prompt,
  'You are an assistant. Answer briefly and to the point, do not add preambles and do not ask ' +
    'follow-up questions when the request is clear.\n\nIf you do not know the answer, say so.',
);
```

## Cheat sheet

Input as it appears in the source, output as the returned string, with default options.

| Source                              | Result            | Why                              |
| ----------------------------------- | ----------------- | -------------------------------- |
| `a` ⏎ `b`                           | `'a b'`           | soft wrap collapses              |
| `a` ⏎ ⏎ `b`                         | `'a\n\nb'`        | blank line = paragraph           |
| `a` ⏎ ⏎ ⏎ ⏎ `b`                     | `'a\n\nb'`        | runs of blank lines collapse     |
| `··a` ⏎ `··b`                       | `'a b'`           | common indent removed            |
| `··a` ⏎ `····b`                     | `'a b'`           | a wrapped line is trimmed        |
| `a` ⏎ `- x` ⏎ `- y`                 | `'a\n- x\n- y'`   | block lines keep their line      |
| `- x` ⏎ `··cont` ⏎ `- y`            | `'- x cont\n- y'` | unmarked line continues the item |
| `··- a` ⏎ `····- b`                 | `'- a\n··- b'`    | relative indent of blocks kept   |
| `# H` ⏎ `text`                      | `'# H\ntext'`     | headings never absorb a line     |
| `- a` ⏎ ⏎ `- b`                     | `'- a\n\n- b'`    | loose list → paragraph break     |
| `` ``` `` ⏎ `x` ⏎ ⏎ `y` ⏎ `` ``` `` | verbatim          | fences pass through untouched    |
| `a\nb` (typed backslash-n)          | `'a\nb'`          | hard break, survives folding     |
| `a` `\` ⏎ `b`                       | `'a\nb'`          | line continuation = hard break   |
| `a··` ⏎ `b` (trailing spaces)       | `'a b'`           | trailing spaces are **dropped**  |
| whitespace only                     | `''`              | empty in, empty out              |

## Rules, in the order they are applied

1. `\r\n` is normalized to `\n`.
2. In the tag form, escape sequences of the raw literal are decoded (see
   [Enter versus `\n`](#enter-versus-n)).
3. The common indent of all non-blank lines is removed; blank lines at the start and end of the
   literal are dropped. Relative indentation is preserved — this is a `dedent`, not a
   `stripIndents`.
4. Blank lines (including whitespace-only ones) split the text into paragraphs; a run of them counts
   as one split. Paragraphs are rejoined with `paragraph` (`'\n\n'`).
5. Inside a paragraph, each line is folded into the previous one with `join` (`' '`), trimming both
   ends — unless the line starts with a markdown block marker, in which case it starts a new line
   and keeps its post-dedent indent.
6. A fenced code block is copied verbatim from its opening fence to its closing one: no folding, no
   trimming, and blank lines inside it do not split paragraphs. Step 3 still applies, so the code
   keeps its relative indent. An unclosed fence runs to the end of the literal.
7. Hard breaks (a typed `\n`, or a line continuation) become real line breaks and are never folded.
8. `${...}` values are inserted verbatim, last, and are invisible to every rule above.

Recognized block markers: `-`, `*`, `+`, `1.` / `1)` (any number), `#` … `######`, `>` — each
followed by a space — plus `|`, `` ``` `` and `~~~`, which need no space. Set `markdown: false` to
treat all of them as ordinary text.

## Enter versus `\n`

The tag reads the **raw** literal and decodes escapes itself, which is what makes the two kinds of
line break distinguishable:

- you **pressed Enter** — a soft wrap, collapsed into `join`;
- you **typed `\n`** — a hard break, kept in the output;
- a backslash at the end of a line (a line continuation) is also a hard break, matching what a
  trailing backslash means in markdown.

```ts
import { assertEquals } from 'jsr:@std/assert@0.205.0';
import { spiel } from '@wire/spiel';

assertEquals(
  spiel`Roses are red,\nviolets are blue,
this line was only wrapped.`,
  'Roses are red,\nviolets are blue, this line was only wrapped.',
);
```

Because the raw literal is decoded, **every backslash in the text must be written twice**. This is
the one place where a spiel literal differs from a plain template literal:

```ts
import { assertEquals } from 'jsr:@std/assert@0.205.0';
import { spiel } from '@wire/spiel';

assertEquals(spiel`match \\d+ digits`, 'match \\d+ digits');
assertEquals(spiel`C:\\Users\\test`, 'C:\\Users\\test');
```

The full template escape set is decoded — `` \` ``, `\\`, `\$`, `\n`, `\r`, `\t`, `\b`, `\f`, `\v`,
`\0`, `\xHH`, `\uHHHH`, `\u{H…}` — and any other `\c` yields `c`.

## Substitutions

A `${...}` value is inserted verbatim and is opaque to the parser: its own line breaks are never
collapsed and are never mistaken for paragraph, block or fence boundaries. The surrounding text is
folded as usual.

````ts
import { assertEquals } from 'jsr:@std/assert@0.205.0';
import { spiel } from '@wire/spiel';

const schema = '{\n  "id": number\n}';

assertEquals(
  spiel`
    Reply with JSON matching this
    schema:

    \`\`\`json
    ${schema}
    \`\`\`
  `,
  'Reply with JSON matching this schema:\n\n```json\n{\n  "id": number\n}\n```',
);
````

A multi-line value is **not** re-indented to the insertion point: its second and following lines
start at column zero regardless of where `${...}` appears. Indent the value yourself if you need it.

## API

```ts
import type { Spiel, SpielOptions } from '@wire/spiel';
```

| Form                         | Meaning                                                                |
| ---------------------------- | ---------------------------------------------------------------------- |
| `` spiel`...` ``             | Tag form. Full behavior, including the Enter versus `\n` distinction.  |
| `spiel('...')`               | Function form, for an already built string. Every `\n` is a soft wrap. |
| `spiel.withOptions({ ... })` | Returns a new `Spiel` with the options merged over the current ones.   |

| Option      | Type      | Default  | Meaning                                                      |
| ----------- | --------- | -------- | ------------------------------------------------------------ |
| `join`      | `string`  | `' '`    | Replacement for a soft wrap. Use `''` for CJK or split URLs. |
| `paragraph` | `string`  | `'\n\n'` | Paragraph separator. The default keeps the output markdown.  |
| `markdown`  | `boolean` | `true`   | Recognize block markers and fences.                          |

`withOptions` never mutates the tag it was called on, and its result can be configured further:

```ts
import { assertEquals } from 'jsr:@std/assert@0.205.0';
import { spiel } from '@wire/spiel';

const tight = spiel.withOptions({ join: '' });
const plain = tight.withOptions({ markdown: false });

assertEquals(
  tight`https://example.com/a/very/long/
path`,
  'https://example.com/a/very/long/path',
);
assertEquals(plain('- a\n- b'), '- a- b');
assertEquals(spiel('a\nb'), 'a b');
```

## Using spiel as a project convention

Reach for it whenever a string is **prose meant for a human or a model** and the literal is longer
than one line: system prompts, `--help` output, error and validation messages, commit or PR
templates, mail bodies.

```ts
import { spiel } from '@wire/spiel';

export const NOT_FOUND = spiel`
  The requested profile does not exist or has been deleted. Check the
  identifier and try again.
`;
```

Do **not** use it where the exact bytes matter: SQL, base64 or other encoded payloads, snapshot
fixtures, generated source files, or any string compared byte-for-byte against an external one. For
those, a plain template literal is the honest choice.

Style rules that follow from the semantics:

- wrap freely to the project line width — the wrapping never reaches the output;
- separate paragraphs with a blank line, never with a typed `\n\n`;
- keep list items and headings on their own source lines; continue a long item on the next line and
  it will be folded back;
- when you truly need a line break inside a paragraph, type `\n` — trailing double spaces do not
  work as a markdown hard break, they are trimmed;
- double every backslash in the text.

## Caveats

- **The function form loses the raw text.** In `spiel('...')` a typed `\n` cannot be told from a
  pressed Enter, so every `\n` is treated as a soft wrap.
- **Loose lists become tight.** A blank line between list items is a paragraph separator, so it
  collapses to a single `paragraph` string and a markdown "loose" list may render as "tight". This
  is deliberate.
- **Headings never absorb the next line.** An ATX heading cannot span lines in markdown, so the
  following line always starts a new one.
- **Trailing whitespace is dropped**, including the two spaces that mean a hard break in markdown.
- **Indented (four-space) code blocks are not supported** — they are indistinguishable from ordinary
  indentation. Use fences.

## What this is not

- Not a markdown parser and not CommonMark: block markers are a heuristic on the start of a line.
- Not a word-wrapper (that is the inverse problem).
- Not an HTML renderer, a validator, or an escaper.

## License

MIT
