# Changelog

All notable changes are listed here. This project follows [Semantic Versioning](https://semver.org).

## [1.1.0] - 2026-11-05

- New rule `link-blocked` (warning). With `--links`, a link that answers 401, 403, 429 or 999 (LinkedIn) is reported as "could not verify" instead of a broken-link error. Sites like LinkedIn, Clutch and Cloudflare-protected pages refuse automated requests even when the page works fine. Real failures (404, 410, 5xx, timeouts) are still errors.

## [1.0.1] - 2026-11-05

- No code changes. Releases now publish through npm trusted publishing (OIDC) with automatic provenance. No npm token is stored in the repo.

## [1.0.0] - 2026-11-05

First release.

- 19 static rules covering the llmstxt.org spec: H1 title, summary blockquote, heading levels, file list format, URL validity, duplicates, the `Optional` section, code fences, size and HTML misconfiguration.
- Network checks: `--links` for dead links (HEAD with GET fallback), `--markdown` for `.md` page versions, content type and redirect checks for remote files.
- Lint a local file, a URL or a bare domain.
- Output formats: `stylish`, `json`, and `github` (inline PR annotations).
- GitHub Action (`korixinc/llms-txt-lint@v1`).
- Node API: `lint()` and `lintText()`.
- Zero dependencies, Node 18+.

[1.1.0]: https://github.com/korixinc/llms-txt-lint/releases/tag/v1.1.0
[1.0.1]: https://github.com/korixinc/llms-txt-lint/releases/tag/v1.0.1
[1.0.0]: https://github.com/korixinc/llms-txt-lint/releases/tag/v1.0.0
