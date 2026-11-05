'use strict';

/**
 * Parse an llms.txt document into a simple structure that the rules can inspect.
 *
 * The llms.txt format (https://llmstxt.org) is a small, opinionated subset of
 * Markdown, so a line based parser is enough and keeps us dependency free.
 */

const LINK_ITEM = /^\s*[-*+]\s+\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)\s*(?::\s*(.*))?$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

function parse(text) {
  const source = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = source.split('\n');

  const doc = {
    source,
    lines,
    h1: [],
    blockquote: null,
    intro: [],
    sections: [],
    headings: [],
    firstContentLine: null,
  };

  let inFence = false;
  let current = null;

  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    const line = raw.replace(/\s+$/, '');

    if (FENCE.test(line)) {
      inFence = !inFence;
      addContent(doc, current, { type: 'code', line: lineNo, text: line });
      return;
    }
    if (inFence) {
      addContent(doc, current, { type: 'code', line: lineNo, text: line });
      return;
    }
    if (line.trim() === '') return;

    if (doc.firstContentLine === null) doc.firstContentLine = lineNo;

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      const h = { level, title, line: lineNo };
      doc.headings.push(h);
      if (level === 1) {
        doc.h1.push(h);
        return;
      }
      if (level === 2) {
        current = { title, line: lineNo, items: [], other: [] };
        doc.sections.push(current);
        return;
      }
      addContent(doc, current, { type: 'heading', line: lineNo, text: line, level });
      return;
    }

    if (/^\s*>/.test(line)) {
      if (!current && doc.sections.length === 0 && doc.blockquote === null && doc.intro.length === 0) {
        doc.blockquote = { line: lineNo, text: line.replace(/^\s*>\s?/, '') };
        return;
      }
      if (doc.blockquote && !current && doc.intro.length === 0 && lineNo === lastLine(doc.blockquote) + 1) {
        doc.blockquote.text += ' ' + line.replace(/^\s*>\s?/, '');
        doc.blockquote.lastLine = lineNo;
        return;
      }
    }

    if (LIST_ITEM.test(line)) {
      const m = LINK_ITEM.exec(line);
      const item = m
        ? { type: 'link', line: lineNo, text: line, name: m[1], url: m[2], notes: m[3] || '' }
        : { type: 'list', line: lineNo, text: line };
      addContent(doc, current, item);
      return;
    }

    addContent(doc, current, { type: 'text', line: lineNo, text: line });
  });

  doc.unclosedFence = inFence;
  return doc;
}

function lastLine(bq) {
  return bq.lastLine || bq.line;
}

function addContent(doc, section, node) {
  if (section) {
    if (node.type === 'link' || node.type === 'list') section.items.push(node);
    else section.other.push(node);
  } else {
    doc.intro.push(node);
  }
}

module.exports = { parse };
