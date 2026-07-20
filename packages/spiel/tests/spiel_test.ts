import { assertEquals } from 'jsr:@std/assert@0.205.0';
import { spiel } from '../mod.ts';

Deno.test('collapses single newlines and keeps blank lines as paragraphs', () => {
  assertEquals(spiel('a\nb'), 'a b');
  assertEquals(spiel('a\n\nb'), 'a\n\nb');
  assertEquals(spiel('a\n\n\n\nb'), 'a\n\nb');
  assertEquals(spiel('\n\na\n\n'), 'a');
});

Deno.test('removes the common indent and trims wrapped lines', () => {
  assertEquals(spiel('  a\n  b'), 'a b');
  assertEquals(spiel('  a\n    b'), 'a b');
  assertEquals(spiel('a   \n   b'), 'a b');
});

Deno.test('normalizes CRLF', () => {
  assertEquals(spiel('a\r\nb'), 'a b');
  assertEquals(spiel('a\r\n\r\nb'), 'a\n\nb');
});

Deno.test('keeps markdown block lines on their own line', () => {
  assertEquals(spiel('a\n- x\n- y'), 'a\n- x\n- y');
  assertEquals(spiel('- x\n  cont\n- y'), '- x cont\n- y');
  assertEquals(spiel('# H\ntext'), '# H\ntext');
  assertEquals(spiel('1. one\n2. two'), '1. one\n2. two');
  assertEquals(spiel('1) one\n2) two'), '1) one\n2) two');
  assertEquals(spiel('| a | b |\n| - | - |'), '| a | b |\n| - | - |');
  assertEquals(spiel('> quote\n> more'), '> quote\n> more');
  assertEquals(spiel('- a\n\n- b'), '- a\n\n- b');
});

Deno.test('never folds a following line into a heading', () => {
  assertEquals(spiel('## H\nfirst\nsecond'), '## H\nfirst second');
});

Deno.test('keeps the post-dedent indent of nested block lines', () => {
  assertEquals(spiel('  - a\n    - b'), '- a\n  - b');
});

Deno.test('handles degenerate input', () => {
  assertEquals(spiel(''), '');
  assertEquals(spiel('   \n\t\n'), '');
  assertEquals(spiel('single'), 'single');
});

Deno.test('works as a template tag over plain text', () => {
  const result = spiel`
    Ты — ассистент. Отвечай кратко и по делу, не добавляй
    вступлений вроде «Конечно!».

    Если не знаешь ответа — так и скажи.
  `;
  assertEquals(
    result,
    'Ты — ассистент. Отвечай кратко и по делу, не добавляй вступлений вроде «Конечно!».' +
      '\n\nЕсли не знаешь ответа — так и скажи.',
  );
});

Deno.test('raw: typed \\n is a hard break, Enter is a soft one', () => {
  assertEquals(
    spiel`foo\nbar
baz`,
    'foo\nbar baz',
  );
  assertEquals(spiel`a\n\nb`, 'a\n\nb');
});

Deno.test('raw: line continuation is a hard break', () => {
  assertEquals(
    spiel`foo\
bar`,
    'foo\nbar',
  );
});

Deno.test('raw: the line after a continuation is dedented', () => {
  assertEquals(
    spiel`
      a\
      b
    `,
    'a\nb',
  );
  assertEquals(
    spiel`
      a\
        deeper
    `,
    'a\ndeeper',
  );
});

Deno.test('raw: spaces typed after a typed \\n stay literal', () => {
  assertEquals(spiel`a\n  b`, 'a\n  b');
});

Deno.test('raw: unescapes the full template escape set', () => {
  assertEquals(spiel`tab\there`, 'tab\there');
  assertEquals(spiel`price \${x}`, 'price ${x}');
  assertEquals(spiel`back\\slash`, 'back\\slash');
  assertEquals(spiel`tick\``, 'tick`');
  assertEquals(spiel`bell\b`, 'bell\b');
  assertEquals(spiel`ff\f`, 'ff\f');
  assertEquals(spiel`vt\v`, 'vt\v');
  assertEquals(spiel`nul\0end`, 'nul\0end');
  assertEquals(spiel`hex\x41`, 'hexA');
  assertEquals(spiel`uni\u0041`, 'uniA');
  assertEquals(spiel`cp\u{1F600}`, 'cp\u{1F600}');
  assertEquals(spiel`non\qescape`, 'nonqescape');
  assertEquals(spiel`double\\nliteral`, 'double\\nliteral');
});

Deno.test('raw: typed \\r is literal and does not collapse', () => {
  assertEquals(spiel`a\rb`, 'a\rb');
});

Deno.test('raw: a hard break is not glued with the join string', () => {
  assertEquals(
    spiel`foo\n
bar`,
    'foo\nbar',
  );
});

Deno.test('fenced code blocks pass through untouched', () => {
  assertEquals(
    spiel('```\nline1\n  line2\n\nline3\n```'),
    '```\nline1\n  line2\n\nline3\n```',
  );
  assertEquals(
    spiel('~~~\na\n\nb\n~~~'),
    '~~~\na\n\nb\n~~~',
  );
  assertEquals(spiel('```ts\nconst a = 1;\n\nconst b = 2;'), '```ts\nconst a = 1;\n\nconst b = 2;');
});

Deno.test('fenced code keeps its relative indent after dedent', () => {
  assertEquals(
    spiel('  text\n  ```\n    code\n  ```'),
    'text\n```\n  code\n```',
  );
});

Deno.test('text after a closing fence starts a new line', () => {
  assertEquals(spiel('```\nx\n```\nafter'), '```\nx\n```\nafter');
});

Deno.test('substitutions are inserted verbatim', () => {
  const value = 'multi\nline\n\nvalue';
  assertEquals(spiel`before ${value} after`, `before ${value} after`);
  assertEquals(spiel`${value}`, value);
  assertEquals(
    spiel`head
${value}`,
    `head ${value}`,
  );
  assertEquals(spiel`${'x'} tail`, 'x tail');
});

Deno.test('a substitution is opaque to block and paragraph detection', () => {
  assertEquals(spiel`${'- not a bullet'}\ntext`, '- not a bullet\ntext');
  assertEquals(
    spiel`a
${'b\n\nc'}
d`,
    'a b\n\nc d',
  );
});

Deno.test('non-string substitution values are stringified', () => {
  assertEquals(spiel`n=${42}`, 'n=42');
});

Deno.test('private use characters in the source are left alone', () => {
  const pua = String.fromCodePoint(0xe000, 0xe001, 0xe002);
  assertEquals(spiel(`${pua}\nb`), `${pua} b`);
  assertEquals(spiel`${pua}\nb`, `${pua}\nb`);
});

Deno.test('withOptions overrides join, paragraph and markdown', () => {
  assertEquals(spiel.withOptions({ join: '' })('a\nb'), 'ab');
  assertEquals(spiel.withOptions({ paragraph: '\n' })('a\n\nb'), 'a\nb');
  assertEquals(spiel.withOptions({ markdown: false })('a\n- x\n- y'), 'a - x - y');
  assertEquals(
    spiel.withOptions({ markdown: false })('```\nx\n```'),
    '``` x ```',
  );
  assertEquals(
    spiel.withOptions({ join: '' })`a
b`,
    'ab',
  );
});

Deno.test('withOptions leaves the base tag untouched', () => {
  const tight = spiel.withOptions({ join: '' });
  assertEquals(tight('a\nb'), 'ab');
  assertEquals(spiel('a\nb'), 'a b');
});
