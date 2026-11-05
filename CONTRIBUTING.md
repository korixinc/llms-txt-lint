# Contributing

Thanks for helping. This is a small tool, so the process is light.

## Reporting a wrong result

The best bug report is a real `llms.txt` that gets linted wrongly. Please include:

- the URL or the file contents
- the command you ran
- what you expected and what you got

If the spec is unclear on the point, say so. We follow [llmstxt.org](https://llmstxt.org) and lean towards warnings rather than errors when the spec leaves room.

## Development

```bash
git clone https://github.com/korixinc/llms-txt-lint
cd llms-txt-lint
npm test
node bin/llms-txt-lint.js test/fixtures/valid.txt
```

There are no dependencies to install. Please keep it that way unless there is a strong reason.

## Adding a rule

1. Add it to `src/rules.js` with an `id`, `severity`, `description` and `check(doc, ctx)` that returns `[{ line, message }]`.
2. Add a test in `test/rules.test.js`, ideally with a fixture.
3. Add a row to the rules table in `README.md`.
4. Note it under an "Unreleased" heading in `CHANGELOG.md`.

Severity guide: `error` means the file breaks the spec or will not be read correctly. `warning` means it is allowed but probably a mistake. `info` is a suggestion.

## Pull requests

Keep them focused. CI runs the tests on Node 18, 20 and 22 across Linux, macOS and Windows.
