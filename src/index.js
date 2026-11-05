'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('./parse');
const { rules } = require('./rules');
const { fetchLlmsTxt, checkLinks } = require('./network');

const DEFAULTS = {
  baseUrl: null,
  maxTokens: 10000,
  checkLinks: false,
  checkMarkdown: false,
  concurrency: 8,
  timeout: 10000,
  disable: [],
};

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

/** Lint llms.txt text that is already in memory. Static rules plus optional network rules. */
async function lintText(text, options = {}) {
  const ctx = { ...DEFAULTS, ...options };
  const doc = parse(text);
  const disabled = new Set(ctx.disable);
  const findings = [];

  for (const rule of rules) {
    if (disabled.has(rule.id)) continue;
    for (const f of rule.check(doc, ctx)) {
      findings.push({ rule: rule.id, severity: rule.severity, ...f });
    }
  }

  if (ctx.checkLinks || ctx.checkMarkdown) {
    for (const f of await checkLinks(doc, ctx)) {
      if (!disabled.has(f.rule)) findings.push(f);
    }
  }

  return finish(findings, doc);
}

/**
 * Lint a local file path, a URL, or a bare domain.
 * Returns { target, findings, stats }.
 */
async function lint(target, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const isLocal = !/^https?:\/\//i.test(target) && fs.existsSync(target);

  if (isLocal) {
    const text = fs.readFileSync(target, 'utf8');
    const result = await lintText(text, opts);
    return { target: path.resolve(target), ...result };
  }

  const fetched = await fetchLlmsTxt(target, opts);
  const result = await lintText(fetched.text, { ...opts, baseUrl: opts.baseUrl || fetched.url });
  const disabled = new Set(opts.disable);
  const extra = fetched.findings.filter((f) => !disabled.has(f.rule));
  return { target: fetched.url, ...finish([...extra, ...result.findings], result.doc) };
}

function finish(findings, doc) {
  findings.sort((a, b) => a.line - b.line || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const stats = { error: 0, warning: 0, info: 0 };
  for (const f of findings) stats[f.severity]++;
  const links = doc.sections.reduce((n, s) => n + s.items.filter((i) => i.type === 'link').length, 0);
  return {
    findings,
    stats,
    summary: {
      title: doc.h1[0] ? doc.h1[0].title : null,
      sections: doc.sections.length,
      links,
      approxTokens: Math.ceil(doc.source.length / 4),
    },
    doc,
  };
}

module.exports = { lint, lintText, parse, rules, DEFAULTS };
