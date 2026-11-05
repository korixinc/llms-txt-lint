# Security Policy

## Supported versions

Only the latest minor release gets security fixes.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private reporting instead: go to the **Security** tab of this repository and click **Report a vulnerability**.

You can expect a first reply within 5 working days.

## Scope

`llms-txt-lint` fetches URLs found in the file it lints when you pass `--links` or `--markdown`. Do not run those options against files you do not trust from inside a network with sensitive internal services, since a hostile file could list internal addresses. Static linting (the default) makes no network requests for local files.
