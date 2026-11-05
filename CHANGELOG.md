# Changelog

All notable changes are listed here. This project follows [Semantic Versioning](https://semver.org).

## [1.0.0] - 2026-11-05

First release.

- 18 static rules covering the llmstxt.org spec: H1 title, summary blockquote, heading levels, file list format, URL validity, duplicates, the `Optional` section, code fences, size and HTML misconfiguration.
- Network checks: `--links` for dead links (HEAD with GET fallback), `--markdown` for `.md` page versions, content type and redirect checks for remote files.
- Lint a local file, a URL or a bare domain.
- Output formats: `stylish`, `json`, and `github` (inline PR annotations).
- GitHub Action (`korixinc/llms-txt-lint@v1`).
- Node API: `lint()` and `lintText()`.
- Zero dependencies, Node 18+.

[1.0.0]: https://github.com/korixinc/llms-txt-lint/releases/tag/v1.0.0
