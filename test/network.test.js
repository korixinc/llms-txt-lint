'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { execFileSync } = require('child_process');
const path = require('path');
const { lint } = require('../src');
const { toLlmsTxtUrl, markdownUrl } = require('../src/network');

let server;
let base;

const LLMS = (b) => `# Test Site

> A small site used to test llms-txt-lint end to end.

## Docs

- [Guide](${b}/guide): the guide page
- [Missing](${b}/missing): this one is a 404
- [Raw](${b}/raw.md): already markdown
`;

test.before(async () => {
  server = http.createServer((req, res) => {
    const send = (status, type, body) => {
      res.writeHead(status, { 'content-type': type });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    switch (req.url) {
      case '/llms.txt': return send(200, 'text/plain; charset=utf-8', LLMS(base));
      case '/html/llms.txt': return send(200, 'text/html', '<!doctype html><html></html>');
      case '/guide': return send(200, 'text/html', '<p>guide</p>');
      case '/raw.md': return send(200, 'text/markdown', '# raw');
      case '/head-not-allowed':
        if (req.method === 'HEAD') return send(405, 'text/plain', '');
        return send(200, 'text/html', 'ok');
      default: return send(404, 'text/plain', 'not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test('toLlmsTxtUrl', () => {
  assert.equal(toLlmsTxtUrl('example.com'), 'https://example.com/llms.txt');
  assert.equal(toLlmsTxtUrl('https://example.com/'), 'https://example.com/llms.txt');
  assert.equal(toLlmsTxtUrl('https://example.com/docs'), 'https://example.com/docs/llms.txt');
  assert.equal(toLlmsTxtUrl('https://example.com/llms-full.txt'), 'https://example.com/llms-full.txt');
});

test('markdownUrl', () => {
  assert.equal(markdownUrl('https://a.dev/docs/'), 'https://a.dev/docs/index.html.md');
  assert.equal(markdownUrl('https://a.dev/guide?x=1#y'), 'https://a.dev/guide.md');
});

test('remote lint without --links only runs static rules', async () => {
  const r = await lint(base);
  assert.equal(r.stats.error, 0);
  assert.equal(r.target, `${base}/llms.txt`);
});

test('--links finds the broken link', async () => {
  const r = await lint(base, { checkLinks: true });
  const broken = r.findings.filter((f) => f.rule === 'link-reachable');
  assert.equal(broken.length, 1);
  assert.match(broken[0].message, /HTTP 404/);
  assert.equal(broken[0].line, 8);
});

test('--markdown reports pages without .md versions', async () => {
  const r = await lint(base, { checkLinks: true, checkMarkdown: true });
  const md = r.findings.find((f) => f.rule === 'markdown-versions');
  assert.ok(md);
  assert.match(md.message, /1 of 1 linked pages/);
});

test('wrong content type and HTML body are flagged', async () => {
  const r = await lint(`${base}/html/llms.txt`);
  const ids = r.findings.map((f) => f.rule);
  assert.ok(ids.includes('content-type'));
  assert.ok(ids.includes('no-html'));
});

test('missing llms.txt is a fatal error', async () => {
  await assert.rejects(lint(`${base}/nothing/llms.txt`), /HTTP 404/);
});

test('HEAD 405 falls back to GET', async () => {
  const text = `# T\n\n> A useful summary for the project.\n\n## Docs\n\n- [A](${base}/head-not-allowed): x\n`;
  const r = await require('../src').lintText(text, { checkLinks: true });
  assert.equal(r.findings.filter((f) => f.rule === 'link-reachable').length, 0);
});

test('CLI exit codes and json output', () => {
  const bin = path.join(__dirname, '..', 'bin', 'llms-txt-lint.js');
  const ok = execFileSync(process.execPath, [bin, path.join(__dirname, 'fixtures', 'valid.txt'), '--format', 'json']);
  assert.equal(JSON.parse(ok).stats.error, 0);

  assert.throws(
    () => execFileSync(process.execPath, [bin, path.join(__dirname, 'fixtures', 'broken.txt')], { stdio: 'pipe' }),
    (e) => e.status === 1,
  );
  assert.throws(
    () => execFileSync(process.execPath, [bin, '--nope'], { stdio: 'pipe' }),
    (e) => e.status === 2,
  );
  let gh = '';
  try {
    execFileSync(process.execPath, [bin, path.join(__dirname, 'fixtures', 'broken.txt'), '--format', 'github'], { stdio: 'pipe' });
  } catch (e) {
    gh = e.stdout.toString();
  }
  assert.match(gh, /^::error file=test\/fixtures\/broken\.txt,line=1,title=llms\.txt%3A h1-required::/m);
});
