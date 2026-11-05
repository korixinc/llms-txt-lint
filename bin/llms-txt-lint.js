#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { lint, rules } = require('../src');
const report = require('../src/report');
const pkg = require('../package.json');

const HELP = `llms-txt-lint ${pkg.version}
Check an llms.txt file against the llmstxt.org spec.

Usage
  llms-txt-lint <file | url | domain> [options]

Examples
  llms-txt-lint ./public/llms.txt
  llms-txt-lint example.com
  llms-txt-lint https://example.com/llms.txt --links
  llms-txt-lint ./llms.txt --base-url https://example.com --links --markdown

Options
  --links              Check that every linked URL responds (network)
  --markdown           Check that linked pages have a .md version (network, implies --links)
  --base-url <url>     Resolve relative links against this URL (local files)
  --max-tokens <n>     Warn above this approximate size (default 10000)
  --max-warnings <n>   Exit with code 1 when warnings exceed n (default: no limit)
  --disable <rules>    Comma separated rule ids to turn off
  --format <name>      stylish (default), json or github
  --quiet              Only report errors
  --timeout <ms>       Per request timeout (default 10000)
  --list-rules         Print all rules and exit
  -v, --version        Print version
  -h, --help           Print this help

Exit codes
  0  no errors     1  errors found (or too many warnings)     2  could not run
`;

function parseArgs(argv) {
  const opts = { format: 'stylish', disable: [] };
  const positional = [];
  const needsValue = new Set(['--base-url', '--max-tokens', '--max-warnings', '--disable', '--format', '--timeout']);
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let value;
    if (arg.startsWith('--') && arg.includes('=')) {
      [arg, value] = [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)];
    }
    if (needsValue.has(arg) && value === undefined) {
      value = argv[++i];
      if (value === undefined) fail(`${arg} needs a value`);
    }
    switch (arg) {
      case '-h': case '--help': opts.help = true; break;
      case '-v': case '--version': opts.version = true; break;
      case '--links': opts.checkLinks = true; break;
      case '--markdown': opts.checkLinks = true; opts.checkMarkdown = true; break;
      case '--quiet': opts.quiet = true; break;
      case '--list-rules': opts.listRules = true; break;
      case '--base-url': opts.baseUrl = value; break;
      case '--max-tokens': opts.maxTokens = toInt(arg, value); break;
      case '--max-warnings': opts.maxWarnings = toInt(arg, value); break;
      case '--timeout': opts.timeout = toInt(arg, value); break;
      case '--disable': opts.disable.push(...value.split(',').map((s) => s.trim()).filter(Boolean)); break;
      case '--format':
        if (!['stylish', 'json', 'github'].includes(value)) fail(`Unknown format "${value}"`);
        opts.format = value;
        break;
      default:
        if (arg.startsWith('-')) fail(`Unknown option ${arg}`);
        positional.push(arg);
    }
  }
  return { opts, positional };
}

function toInt(name, v) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) fail(`${name} must be a positive number`);
  return n;
}

function fail(msg) {
  process.stderr.write(`llms-txt-lint: ${msg}\nRun "llms-txt-lint --help" for usage.\n`);
  process.exit(2);
}

async function main() {
  const { opts, positional } = parseArgs(process.argv.slice(2));
  if (opts.help) return void process.stdout.write(HELP);
  if (opts.version) return void process.stdout.write(pkg.version + '\n');
  if (opts.listRules) {
    const extra = [
      { id: 'link-reachable', severity: 'error', description: 'Linked URLs must respond with a 2xx/3xx status. (--links)' },
      { id: 'markdown-versions', severity: 'info', description: 'Linked HTML pages should have a .md version. (--markdown)' },
      { id: 'content-type', severity: 'warning', description: 'Remote llms.txt should be served as text/plain or text/markdown. (URLs)' },
      { id: 'redirect', severity: 'info', description: 'Remote llms.txt should not redirect. (URLs)' },
    ];
    for (const r of [...rules, ...extra]) process.stdout.write(`${r.id.padEnd(22)} ${r.severity.padEnd(8)} ${r.description}\n`);
    return;
  }

  let target = positional[0];
  if (!target) {
    if (fs.existsSync('llms.txt')) target = 'llms.txt';
    else if (fs.existsSync(path.join('public', 'llms.txt'))) target = path.join('public', 'llms.txt');
    else fail('No file or URL given, and no llms.txt in the current folder.');
  }

  let result;
  try {
    result = await lint(target, opts);
  } catch (err) {
    if (err.fatal) fail(err.message);
    throw err;
  }

  const out =
    opts.format === 'json'
      ? report.json(result)
      : opts.format === 'github'
        ? report.github(result, { file: fs.existsSync(target) ? path.relative(process.cwd(), target).split(path.sep).join('/') : null, quiet: opts.quiet })
        : report.stylish(result, { quiet: opts.quiet });
  process.stdout.write(out + '\n');

  const tooManyWarnings = opts.maxWarnings !== undefined && result.stats.warning > opts.maxWarnings;
  process.exitCode = result.stats.error > 0 || tooManyWarnings ? 1 : 0;
}

main().catch((err) => {
  process.stderr.write(`llms-txt-lint: unexpected error: ${err.stack || err}\n`);
  process.exit(2);
});
