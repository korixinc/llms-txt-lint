'use strict';

const { allLinks, resolve } = require('./rules');
const pkg = require('../package.json');

// Status codes that usually mean "bots not welcome" rather than "page missing".
// 999 is LinkedIn's anti-bot response.
const BLOCKED_STATUS = new Set([401, 403, 429, 999]);

const USER_AGENT =`llms-txt-lint/${pkg.version} (+https://github.com/korixinc/llms-txt-lint)`;

/**
 * Turn "example.com", "https://example.com" or "https://example.com/docs/llms.txt"
 * into the URL of the llms.txt file to fetch.
 */
function toLlmsTxtUrl(input) {
  let s = String(input).trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const u = new URL(s);
  if (!/\.txt$/i.test(u.pathname)) {
    u.pathname = u.pathname.replace(/\/?$/, '/') + 'llms.txt';
  }
  return u.href;
}

async function request(url, { method = 'GET', timeout = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/markdown, text/plain;q=0.9, */*;q=0.5' },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch the llms.txt file itself. Returns { text, url, findings }. */
async function fetchLlmsTxt(target, { timeout } = {}) {
  const url = toLlmsTxtUrl(target);
  let res;
  try {
    res = await request(url, { timeout });
  } catch (err) {
    const reason = describe(err);
    const e = new Error(`Could not fetch ${url}: ${reason}`);
    e.fatal = true;
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`Could not fetch ${url}: HTTP ${res.status}. No llms.txt found at this address.`);
    e.fatal = true;
    throw e;
  }
  const text = await res.text();
  const findings = [];
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (type && !/^text\/(plain|markdown|x-markdown)/.test(type)) {
    findings.push({
      rule: 'content-type',
      severity: 'warning',
      line: 1,
      message: `Served as "${type}". Use "text/plain" or "text/markdown".`,
    });
  }
  if (res.redirected && res.url !== url) {
    findings.push({
      rule: 'redirect',
      severity: 'info',
      line: 1,
      message: `${url} redirects to ${res.url}. Some crawlers do not follow redirects.`,
    });
  }
  return { text, url: res.url || url, findings };
}

async function probe(url, timeout) {
  try {
    let res = await request(url, { method: 'HEAD', timeout });
    if ([403, 405, 501].includes(res.status)) res = await request(url, { method: 'GET', timeout });
    if (res.body && typeof res.body.cancel === 'function') res.body.cancel().catch(() => {});
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: describe(err) };
  }
}

function describe(err) {
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return 'timed out';
  const cause = err.cause;
  if (cause) return cause.code && cause.code !== 'UND_ERR_ABORTED' ? cause.code : cause.message || String(cause);
  return err.message;
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

/**
 * Check that every link resolves. Optionally check that a Markdown version of
 * each HTML page exists (the spec suggests serving page.html.md / page.md).
 */
async function checkLinks(doc, ctx) {
  const links = allLinks(doc)
    .map((l) => ({ ...l, resolved: resolve(l.url, ctx.baseUrl) }))
    .filter((l) => l.resolved && /^https?:$/.test(l.resolved.protocol));

  const unique = new Map();
  for (const l of links) {
    const key = l.resolved.href.replace(/#.*$/, '');
    if (!unique.has(key)) unique.set(key, []);
    unique.get(key).push(l);
  }

  const keys = [...unique.keys()];
  const findings = [];
  const results = await pool(keys, ctx.concurrency, (k) => probe(k, ctx.timeout));

  keys.forEach((k, i) => {
    const r = results[i];
    if (r.ok) return;
    for (const l of unique.get(k)) {
      if (BLOCKED_STATUS.has(r.status)) {
        // Many sites (LinkedIn, Clutch, Cloudflare protected pages) refuse
        // automated requests. That says nothing about whether the link works.
        findings.push({
          rule: 'link-blocked',
          severity: 'warning',
          line: l.line,
          message: `Could not verify "${l.url}" (HTTP ${r.status}). The site blocks automated checks, so open it in a browser to confirm.`,
        });
        continue;
      }
      findings.push({
        rule: 'link-reachable',
        severity: 'error',
        line: l.line,
        message: r.status ? `Broken link "${l.url}" (HTTP ${r.status}).` : `Unreachable link "${l.url}" (${r.error}).`,
      });
    }
  });

  if (ctx.checkMarkdown) {
    const candidates = keys.filter((k, i) => results[i].ok && !/\.(md|txt|json|pdf|xml|ya?ml)$/i.test(new URL(k).pathname));
    const mdResults = await pool(candidates, ctx.concurrency, (k) => probe(markdownUrl(k), ctx.timeout));
    const missing = candidates.filter((k, i) => !mdResults[i].ok);
    if (missing.length) {
      const first = unique.get(missing[0])[0];
      findings.push({
        rule: 'markdown-versions',
        severity: 'info',
        line: first.line,
        message: `${missing.length} of ${candidates.length} linked pages have no Markdown version (e.g. ${markdownUrl(missing[0])}). The spec suggests serving one.`,
      });
    }
  }

  return findings;
}

function markdownUrl(href) {
  const u = new URL(href);
  u.hash = '';
  u.search = '';
  if (u.pathname.endsWith('/')) u.pathname += 'index.html.md';
  else u.pathname += '.md';
  return u.href;
}

module.exports = { fetchLlmsTxt, checkLinks, toLlmsTxtUrl, markdownUrl, USER_AGENT };
