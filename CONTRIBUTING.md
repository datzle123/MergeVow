# Contributing

MergeVow is in early implementation. Contributions should begin from an approved `SW-*` backlog
item.

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities only
through [GitHub private vulnerability reporting](https://github.com/datzle123/MergeVow/security/advisories/new).

## Development

```bash
corepack enable
pnpm install
pnpm browser:install
pnpm check
```

## Pull Requests

- Keep one behavioral objective per PR.
- Include the relevant `SW-*` ID.
- Use `Closes #<issue>` so the accepted issue and merged change stay connected.
- State acceptance criteria and verification performed.
- Add a failing and passing fixture for changes to contract semantics.
- Update the threat model or an ADR when changing a trust boundary.
- Do not mix implementation changes with unrelated formatting or metadata churn.

## Good First Contribution Surfaces

After V0 begins, suitable small contributions include fixture cases, redactors, reporter formats,
framework recipes, and benchmark mutations. Core contract interpretation and approval logic require
maintainer review.
