# Ready To Start

StillWorks is in implementation. The contract kernel and strict semantic locator resolver are built
and tested; the deterministic interpreter has not been built yet.

## Locked Decisions

- Name: StillWorks.
- Language: TypeScript first; Rust only after a measured systems requirement.
- Runtime baseline: Node.js 24 and pnpm 11.
- Browser wedge: deterministic, loginless Chromium.
- Product kernel: versioned data-only behavior contracts.
- First implementation milestone: handwritten-contract persistence vertical slice.

## Prepared

- Product plan, charter, threat model, backlog, validation plan, interview script, and OSS plan.
- Three demo specifications and benchmark workspace.
- pnpm monorepo folder layout and TypeScript strict base config.
- Biome, TypeScript, Vitest, tsx, tsup, Playwright, and Node types with a lockfile.
- GitHub issue forms, PR template, and ordinary repository lint/test CI. This scaffold workflow is
  not the StillWorks PR Drift Gate and provides no artifact-selection or isolation guarantee.
- `AGENTS.md` for repository agents.
- Version-controlled `build-stillworks` skill and a validated personal installation.
- MIT license, contributing guide, and security policy.

## Verified Locally

- `pnpm install`
- `pnpm browser:install`
- `pnpm check`
- `pnpm audit --audit-level low`: no known vulnerabilities
- `@stillworks/contract`: 43 Vitest cases covering schema, hostile inputs, canonicalization, and hash
- Contract package typecheck, clean build, package dry-run, and built-ESM parser smoke
- `@stillworks/playwright-driver`: 10 real-Chromium cases covering semantic refactors, exact matching,
  missing/ambiguous evidence, count observation, and browser-error propagation
- Playwright-driver typecheck, clean build, and package dry-run
- Published and built JSON Schema SHA-256 equality
- Chromium launch and semantic heading lookup
- All project-relative Markdown links
- Skill validator for source and installed copies
- Independent skill forward-test against `SW-002`; it enforced dependencies, scope, and security
  boundaries and found a contract-example inconsistency that was corrected

## Published

- Public repository: [datzle123/StillWorks](https://github.com/datzle123/StillWorks).
- Repository CI, Issues, Discussions, security reporting, and project topics are enabled.

## External Setup Still Required

These require the owner's accounts or identity and were intentionally not guessed:

- Reserve the npm package/scope.
- Choose a domain and perform trademark checks.
- Replace the temporary security-reporting process with a private contact.
- Recruit and schedule the first five interview/pilot candidates.

## Next Action

`SW-001` through `SW-004` are complete. Open `docs/BACKLOG.md` and start `SW-005`. Do not implement the
recorder first.
