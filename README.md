# llms-txt-lint

[![CI](https://github.com/korixinc/llms-txt-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/korixinc/llms-txt-lint/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/llms-txt-lint.svg)](https://www.npmjs.com/package/llms-txt-lint)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Check your `llms.txt` before an AI model reads it.

`llms-txt-lint` validates an `llms.txt` file against the [llmstxt.org](https://llmstxt.org) spec. It finds broken structure, dead links, misconfigured servers and files that are too big to be useful. It runs as a CLI, a Node library and a GitHub Action that comments problems inline on your pull requests.

No dependencies. Node 18 or newer.

```
$ npx llms-txt-lint llms.txt --quiet

llms.txt
  "Acme" · 3 sections · 5 links · ~83 tokens

   1: error    The H1 title must be the first thing in the file.  h1-required
   4: error    Extra H1 "Acme Docs". Use "##" for sections.  h1-single
  17: error    Invalid URL "setup.html". Relative URLs need --base-url when linting a local file.  link-url-valid
  20: error    Link has empty name.  link-format
  24: error    Code fence is never closed. Everything after it is ignored.  unclosed-code-fence

✖ 5 errors, 10 warnings, 1 suggestion
```

## Why

An `llms.txt` file is easy to write and easy to get wrong. Nothing complains when it breaks. Typical problems:

- The server returns the site's HTML app shell at `/llms.txt` instead of the file.
- Links rot after a docs migration and nobody notices.
- Extra `#` headings or paragraphs inside sections, so parsers that follow the spec skip content.
- `## Optional` placed in the middle, or spelled `## optional`, so tools cannot drop it when context is short.
- The file grows to tens of thousands of tokens and stops fitting in a context window.

A linter in CI catches these the moment they happen.

## Usage

```bash
# a local file
npx llms-txt-lint ./public/llms.txt

# a live site (fetches https://example.com/llms.txt)
npx llms-txt-lint example.com

# also check every link responds
npx llms-txt-lint example.com --links

# also check linked pages offer a .md version, as the spec suggests
npx llms-txt-lint example.com --markdown

# local file with relative links
npx llms-txt-lint ./llms.txt --base-url https://example.com --links
```

With no argument it looks for `./llms.txt`, then `./public/llms.txt`.

### Options

| Option | What it does |
| --- | --- |
| `--links` | Check that every linked URL responds |
| `--markdown` | Check that linked pages have a `.md` version (implies `--links`) |
| `--base-url <url>` | Resolve relative links against this URL |
| `--max-tokens <n>` | Warn above this approximate size (default 10000) |
| `--max-warnings <n>` | Exit 1 when there are more than `n` warnings |
| `--disable <ids>` | Comma separated rule ids to turn off |
| `--format <name>` | `stylish` (default), `json` or `github` |
| `--quiet` | Only report errors |
| `--timeout <ms>` | Per request timeout (default 10000) |
| `--list-rules` | Print every rule |

Exit codes: `0` no errors, `1` errors found (or too many warnings), `2` could not run (bad option, file not found, site unreachable).

## GitHub Action

```yaml
name: llms.txt
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: korixinc/llms-txt-lint@v1
        with:
          path: public/llms.txt
          base-url: https://example.com
          links: true
```

Problems show up as annotations on the exact line in the pull request diff.

To watch a live site instead of a file in the repo, point `path` at the domain and run it on a schedule:

```yaml
on:
  schedule:
    - cron: '0 6 * * 1'
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: korixinc/llms-txt-lint@v1
        with:
          path: example.com
          links: true
```

| Input | Default | Description |
| --- | --- | --- |
| `path` | `./llms.txt` | File in the repo, or a URL or domain |
| `links` | `false` | Check every link responds |
| `markdown` | `false` | Check for `.md` versions of linked pages |
| `base-url` | | Resolve relative links |
| `max-tokens` | `10000` | Size warning threshold |
| `max-warnings` | | Fail when warnings exceed this number |
| `disable` | | Comma separated rule ids |
| `quiet` | `false` | Only report errors |

## Rules

| Rule | Severity | Checks |
| --- | --- | --- |
| `not-empty` | error | The file has content |
| `h1-required` | error | Starts with an H1 title (the only required part of the spec) |
| `h1-single` | error | Only one H1 |
| `summary-blockquote` | warning | A `> summary` follows the H1 |
| `no-deep-headings` | warning | Only H1 and H2 are used |
| `section-has-links` | warning | Each H2 section has links |
| `section-list-only` | warning | Sections contain list items, not paragraphs |
| `link-format` | error | Links are well formed `- [name](url): notes` |
| `section-plain-items` | warning | Section list items are links, not plain text |
| `link-url-valid` | error | URLs are valid http(s) |
| `link-https` | warning | Links use https |
| `link-duplicate` | warning | No URL listed twice |
| `link-notes` | info | Most links have a short description |
| `optional-last` | warning | `## Optional` is the last section |
| `optional-casing` | warning | It is spelled exactly `Optional` |
| `section-duplicate` | warning | Section names are unique |
| `unclosed-code-fence` | error | Code fences are closed |
| `max-size` | warning | The file fits in a context window |
| `no-html` | error | The server did not return an HTML page |
| `content-type` | warning | Served as `text/plain` or `text/markdown` (URLs) |
| `redirect` | info | `/llms.txt` does not redirect (URLs) |
| `link-reachable` | error | Every link responds (`--links`) |
| `markdown-versions` | info | Linked pages offer a `.md` version (`--markdown`) |

Turn any rule off with `--disable rule-id`.

## Node API

```js
const { lint, lintText } = require('llms-txt-lint');

const result = await lint('example.com', { checkLinks: true });
console.log(result.stats); // { error: 1, warning: 2, info: 0 }

for (const f of result.findings) {
  console.log(f.line, f.severity, f.rule, f.message);
}

// or lint a string you already have
const r = await lintText(myLlmsTxt, { baseUrl: 'https://example.com' });
```

## Need to create an llms.txt first?

Use [llms-txt-gen](https://github.com/korixinc/llms-txt-gen). It builds one from your sitemap. Then run this to keep it healthy.

## Contributing

Bug reports with a real `llms.txt` that is linted wrongly are the most useful thing you can send. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. Built and maintained by [KORIX](https://korixinc.com).
