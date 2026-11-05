'use strict';

/**
 * Static rules. Each rule looks at the parsed document only (no network).
 * Network rules live in src/network.js.
 *
 * Severity:
 *   error   - breaks the llms.txt spec, tools may fail to read the file
 *   warning - allowed by the spec but likely a mistake or hurts usefulness
 *   info    - a suggestion
 */

const rules = [
  {
    id: 'not-empty',
    severity: 'error',
    description: 'The file must contain content.',
    check(doc) {
      return doc.firstContentLine === null ? [{ line: 1, message: 'File is empty.' }] : [];
    },
  },
  {
    id: 'h1-required',
    severity: 'error',
    description: 'The file must start with an H1 holding the project or site name. It is the only required section in the spec.',
    check(doc) {
      if (doc.firstContentLine === null) return [];
      if (doc.h1.length === 0) {
        return [{ line: doc.firstContentLine, message: 'Missing H1 title (e.g. "# My Project").' }];
      }
      if (doc.h1[0].line !== doc.firstContentLine) {
        return [{ line: doc.firstContentLine, message: 'The H1 title must be the first thing in the file.' }];
      }
      if (!doc.h1[0].title) {
        return [{ line: doc.h1[0].line, message: 'H1 title is empty.' }];
      }
      return [];
    },
  },
  {
    id: 'h1-single',
    severity: 'error',
    description: 'Only one H1 is allowed.',
    check(doc) {
      return doc.h1.slice(1).map((h) => ({ line: h.line, message: `Extra H1 "${h.title}". Use "##" for sections.` }));
    },
  },
  {
    id: 'summary-blockquote',
    severity: 'warning',
    description: 'A blockquote summary should follow the H1. It is the first thing a model reads.',
    check(doc) {
      if (doc.h1.length === 0) return [];
      if (!doc.blockquote) {
        return [{ line: doc.h1[0].line, message: 'Add a one or two sentence "> summary" right after the H1.' }];
      }
      if (doc.blockquote.text.trim().length < 20) {
        return [{ line: doc.blockquote.line, message: 'Summary blockquote is very short. Say what the project is and who it is for.' }];
      }
      return [];
    },
  },
  {
    id: 'no-deep-headings',
    severity: 'warning',
    description: 'Only H1 and H2 headings are part of the format. The intro must not contain headings and file lists are delimited by H2.',
    check(doc) {
      return doc.headings
        .filter((h) => h.level > 2)
        .map((h) => ({ line: h.line, message: `H${h.level} "${h.title}" is not part of the llms.txt format. Use "##" or plain text.` }));
    },
  },
  {
    id: 'section-has-links',
    severity: 'warning',
    description: 'Every H2 section should contain a list of links.',
    check(doc) {
      return doc.sections
        .filter((s) => !s.items.some((i) => i.type === 'link'))
        .map((s) => ({ line: s.line, message: `Section "${s.title}" has no links.` }));
    },
  },
  {
    id: 'section-list-only',
    severity: 'warning',
    description: 'H2 sections are "file lists": they should only contain list items, not paragraphs.',
    check(doc) {
      const out = [];
      for (const s of doc.sections) {
        for (const n of s.other) {
          if (n.type === 'code') continue;
          out.push({ line: n.line, message: `Text inside section "${s.title}" is not a list item. Move it to the intro or make it a link note.` });
        }
      }
      return out;
    },
  },
  {
    id: 'link-format',
    severity: 'error',
    description: 'File list items must be "- [name](url)" optionally followed by ": notes".',
    check(doc) {
      const out = [];
      for (const s of doc.sections) {
        for (const i of s.items) {
          if (i.type === 'list') {
            // Only flag items that look like an attempted link. Plain bullet
            // text is reported (as a warning) by section-plain-items instead.
            if (/\[|\]\(|https?:\/\//.test(i.text)) {
              out.push({ line: i.line, message: 'Malformed link. Use "- [name](url): notes".' });
            }
          } else if (!i.name.trim()) {
            out.push({ line: i.line, message: 'Link has empty name.' });
          } else if (!i.url) {
            out.push({ line: i.line, message: `Link "${i.name}" has empty URL.` });
          }
        }
      }
      return out;
    },
  },
  {
    id: 'section-plain-items',
    severity: 'warning',
    description: 'File list items should be links. Plain bullet text inside an H2 section is ignored by tools that follow the spec.',
    check(doc) {
      const out = [];
      for (const s of doc.sections) {
        const plain = s.items.filter((i) => i.type === 'list' && !/\[|\]\(|https?:\/\//.test(i.text));
        if (plain.length) {
          out.push({ line: plain[0].line, message: `Section "${s.title}" has ${plain.length} list item${plain.length === 1 ? '' : 's'} without a link. Tools following the spec may skip ${plain.length === 1 ? 'it' : 'them'}.` });
        }
      }
      return out;
    },
  },
  {
    id: 'link-url-valid',
    severity: 'error',
    description: 'Link URLs must be valid absolute URLs, or relative URLs when a base URL is known.',
    check(doc, ctx) {
      const out = [];
      for (const link of allLinks(doc)) {
        if (!link.url) continue;
        const resolved = resolve(link.url, ctx.baseUrl);
        if (!resolved) {
          const hint = isAbsolute(link.url) ? '' : ' Relative URLs need --base-url when linting a local file.';
          out.push({ line: link.line, message: `Invalid URL "${link.url}".${hint}` });
        } else if (!/^https?:$/.test(resolved.protocol)) {
          out.push({ line: link.line, message: `Unsupported URL scheme "${resolved.protocol}" in "${link.url}".` });
        }
      }
      return out;
    },
  },
  {
    id: 'link-https',
    severity: 'warning',
    description: 'Links should use https.',
    check(doc) {
      return allLinks(doc)
        .filter((l) => /^http:\/\//i.test(l.url) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(l.url))
        .map((l) => ({ line: l.line, message: `Insecure http link "${l.url}".` }));
    },
  },
  {
    id: 'link-duplicate',
    severity: 'warning',
    description: 'The same URL should not be listed twice.',
    check(doc, ctx) {
      const seen = new Map();
      const out = [];
      for (const l of allLinks(doc)) {
        const key = normalize(l.url, ctx.baseUrl);
        if (!key) continue;
        if (seen.has(key)) {
          out.push({ line: l.line, message: `Duplicate link "${l.url}" (first listed on line ${seen.get(key)}).` });
        } else {
          seen.set(key, l.line);
        }
      }
      return out;
    },
  },
  {
    id: 'link-notes',
    severity: 'info',
    description: 'Short notes after a link (": what it covers") help models choose what to read.',
    check(doc) {
      const links = allLinks(doc).filter((l) => l.section !== 'Optional');
      if (links.length === 0) return [];
      const missing = links.filter((l) => !l.notes.trim());
      if (missing.length / links.length < 0.5) return [];
      return [{ line: missing[0].line, message: `${missing.length} of ${links.length} links have no description. Add ": notes" after the link.` }];
    },
  },
  {
    id: 'optional-last',
    severity: 'warning',
    description: 'The "## Optional" section has special meaning (it can be skipped for short context) and should be the last section.',
    check(doc) {
      const idx = doc.sections.findIndex((s) => s.title.toLowerCase() === 'optional');
      if (idx === -1 || idx === doc.sections.length - 1) return [];
      const s = doc.sections[idx];
      if (s.title !== 'Optional') return [];
      return [{ line: s.line, message: '"## Optional" should be the last section.' }];
    },
  },
  {
    id: 'optional-casing',
    severity: 'warning',
    description: 'The spec names the section exactly "Optional". Other spellings will not be treated as skippable.',
    check(doc) {
      return doc.sections
        .filter((s) => s.title.toLowerCase() === 'optional' && s.title !== 'Optional')
        .map((s) => ({ line: s.line, message: `Section "${s.title}" should be spelled "Optional".` }));
    },
  },
  {
    id: 'section-duplicate',
    severity: 'warning',
    description: 'Section names should be unique.',
    check(doc) {
      const seen = new Map();
      const out = [];
      for (const s of doc.sections) {
        const k = s.title.toLowerCase();
        if (seen.has(k)) out.push({ line: s.line, message: `Section "${s.title}" already appears on line ${seen.get(k)}.` });
        else seen.set(k, s.line);
      }
      return out;
    },
  },
  {
    id: 'unclosed-code-fence',
    severity: 'error',
    description: 'Code fences must be closed.',
    check(doc) {
      if (!doc.unclosedFence) return [];
      const fence = [...doc.lines.keys()].filter((i) => /^\s*(```|~~~)/.test(doc.lines[i])).pop();
      return [{ line: fence + 1, message: 'Code fence is never closed. Everything after it is ignored.' }];
    },
  },
  {
    id: 'max-size',
    severity: 'warning',
    description: 'llms.txt should stay small enough to fit in a context window. Put full content in llms-full.txt instead.',
    check(doc, ctx) {
      const tokens = Math.ceil(doc.source.length / 4);
      if (tokens <= ctx.maxTokens) return [];
      return [{ line: 1, message: `File is about ${tokens.toLocaleString('en-US')} tokens (limit ${ctx.maxTokens.toLocaleString('en-US')}). Move detail into llms-full.txt.` }];
    },
  },
  {
    id: 'no-html',
    severity: 'error',
    description: 'llms.txt should be Markdown, not HTML. Serving an HTML page at /llms.txt is a common misconfiguration.',
    check(doc) {
      const head = doc.source.slice(0, 500).toLowerCase();
      if (head.includes('<!doctype html') || head.includes('<html')) {
        return [{ line: 1, message: 'Looks like HTML, not Markdown. Your server may be returning a web page (e.g. an SPA fallback) for /llms.txt.' }];
      }
      return [];
    },
  },
];

function allLinks(doc) {
  const out = [];
  for (const n of doc.intro) if (n.type === 'link') out.push({ ...n, section: null });
  for (const s of doc.sections) for (const i of s.items) if (i.type === 'link') out.push({ ...i, section: s.title });
  return out;
}

function isAbsolute(url) {
  return /^[a-z][a-z0-9+.-]*:/i.test(url);
}

function resolve(url, base) {
  try {
    return base ? new URL(url, base) : new URL(url);
  } catch {
    return null;
  }
}

function normalize(url, base) {
  const u = resolve(url, base);
  if (!u) return null;
  u.hash = '';
  return u.href.replace(/\/$/, '');
}

module.exports = { rules, allLinks, resolve };
