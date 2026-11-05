'use strict';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = c(31);
const yellow = c(33);
const blue = c(34);
const dim = c(2);
const bold = c(1);
const green = c(32);

const LABEL = { error: red('error  '), warning: yellow('warning'), info: blue('info   ') };

function stylish(result, { quiet } = {}) {
  const lines = [];
  const shown = result.findings.filter((f) => !quiet || f.severity === 'error');
  lines.push(bold(result.target));
  const s = result.summary;
  lines.push(dim(`  ${s.title ? `"${s.title}"` : 'untitled'} · ${s.sections} sections · ${s.links} links · ~${s.approxTokens.toLocaleString('en-US')} tokens`));
  lines.push('');
  if (shown.length === 0) {
    lines.push(green('  ✓ No problems found'));
  } else {
    const width = String(Math.max(...shown.map((f) => f.line))).length;
    for (const f of shown) {
      lines.push(`  ${dim(String(f.line).padStart(width) + ':')} ${LABEL[f.severity]}  ${f.message}  ${dim(f.rule)}`);
    }
  }
  lines.push('');
  const { error, warning, info } = result.stats;
  const tally = `${error} error${error === 1 ? '' : 's'}, ${warning} warning${warning === 1 ? '' : 's'}, ${info} suggestion${info === 1 ? '' : 's'}`;
  lines.push(error ? red(bold(`✖ ${tally}`)) : warning ? yellow(`⚠ ${tally}`) : green(`✓ ${tally}`));
  return lines.join('\n');
}

function json(result) {
  const { doc, ...rest } = result;
  return JSON.stringify(rest, null, 2);
}

/** GitHub Actions workflow commands, shown as inline annotations on PRs. */
function github(result, { file, quiet } = {}) {
  const level = { error: 'error', warning: 'warning', info: 'notice' };
  const out = [];
  for (const f of result.findings) {
    if (quiet && f.severity !== 'error') continue;
    const props = [file ? `file=${esc(file, true)}` : null, `line=${f.line}`, `title=${esc(`llms.txt: ${f.rule}`, true)}`]
      .filter(Boolean)
      .join(',');
    out.push(`::${level[f.severity]} ${props}::${esc(f.message)}`);
  }
  out.push(stylish(result, { quiet }));
  return out.join('\n');
}

function esc(s, prop) {
  let r = String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  if (prop) r = r.replace(/:/g, '%3A').replace(/,/g, '%2C');
  return r;
}

module.exports = { stylish, json, github };
