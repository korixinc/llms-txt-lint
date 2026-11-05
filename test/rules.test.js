'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { lintText, parse } = require('../src');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const ids = (r) => r.findings.map((f) => f.rule);

test('valid spec example has no findings', async () => {
  const r = await lintText(fixture('valid.txt'));
  assert.deepEqual(r.findings, []);
  assert.equal(r.summary.title, 'FastHTML');
  assert.equal(r.summary.sections, 3);
  assert.equal(r.summary.links, 4);
});

test('broken file reports every expected rule', async () => {
  const r = await lintText(fixture('broken.txt'));
  for (const id of [
    'h1-required',
    'h1-single',
    'summary-blockquote',
    'no-deep-headings',
    'optional-last',
    'section-list-only',
    'link-format',
    'section-plain-items',
    'link-url-valid',
    'link-https',
    'link-duplicate',
    'section-has-links',
    'section-duplicate',
    'unclosed-code-fence',
  ]) {
    assert.ok(ids(r).includes(id), `expected ${id}`);
  }
  assert.ok(r.stats.error > 0);
});

test('plain bullets are a warning, malformed links are an error', async () => {
  const text = '# T\n\n> A useful summary for the project.\n\n## Notes\n\n- just a note\n- another note\n\n## Docs\n\n- [Broken(https://a.dev)\n- [Good](https://b.dev): fine\n';
  const r = await lintText(text);
  const plain = r.findings.filter((f) => f.rule === 'section-plain-items');
  const bad = r.findings.filter((f) => f.rule === 'link-format');
  assert.equal(plain.length, 1);
  assert.match(plain[0].message, /2 list items/);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].line, 12);
});

test('empty file', async () => {
  const r = await lintText('  \n\n');
  assert.deepEqual(ids(r), ['not-empty']);
});

test('H1 only is valid (it is the only required part) but gets a summary warning', async () => {
  const r = await lintText('# Just a title\n');
  assert.equal(r.stats.error, 0);
  assert.deepEqual(ids(r), ['summary-blockquote']);
});

test('multi line blockquote is joined', () => {
  const doc = parse('# T\n\n> line one\n> line two\n');
  assert.equal(doc.blockquote.text, 'line one line two');
});

test('headings inside code fences are ignored', async () => {
  const r = await lintText('# T\n\n> A useful summary for the project.\n\n```md\n### not a heading\n# nor this\n```\n');
  assert.equal(r.stats.error, 0);
});

test('relative links resolve with baseUrl', async () => {
  const text = '# T\n\n> A useful summary for the project.\n\n## Docs\n\n- [Setup](/docs/setup.md): how to install\n';
  const without = await lintText(text);
  assert.ok(ids(without).includes('link-url-valid'));
  const withBase = await lintText(text, { baseUrl: 'https://example.com/llms.txt' });
  assert.ok(!ids(withBase).includes('link-url-valid'));
});

test('link with title attribute and no notes parses', () => {
  const doc = parse('# T\n\n## Docs\n\n- [A](https://a.dev "Title")\n* [B](https://b.dev): note\n');
  const items = doc.sections[0].items;
  assert.equal(items[0].type, 'link');
  assert.equal(items[0].url, 'https://a.dev');
  assert.equal(items[1].notes, 'note');
});

test('non http scheme is rejected', async () => {
  const r = await lintText('# T\n\n> A useful summary for the project.\n\n## Docs\n\n- [Mail](mailto:a@b.c): contact\n');
  assert.ok(ids(r).includes('link-url-valid'));
});

test('wrongly cased Optional section', async () => {
  const r = await lintText('# T\n\n> A useful summary for the project.\n\n## optional\n\n- [A](https://a.dev): x\n');
  assert.ok(ids(r).includes('optional-casing'));
});

test('max-size warning uses maxTokens', async () => {
  const big = '# T\n\n> A useful summary for the project.\n\n' + 'word '.repeat(2000);
  const r = await lintText(big, { maxTokens: 500 });
  assert.ok(ids(r).includes('max-size'));
});

test('HTML served as llms.txt is flagged', async () => {
  const r = await lintText('<!DOCTYPE html><html><head></head><body>app</body></html>');
  assert.ok(ids(r).includes('no-html'));
});

test('disable turns rules off', async () => {
  const r = await lintText('# Just a title\n', { disable: ['summary-blockquote'] });
  assert.deepEqual(r.findings, []);
});

test('CRLF and BOM are handled', async () => {
  const r = await lintText('﻿# T\r\n\r\n> A useful summary for the project.\r\n');
  assert.deepEqual(r.findings, []);
});
