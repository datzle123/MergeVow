# Ready To Start

MergeVow is in implementation. The contract kernel, strict semantic locator resolver,
deterministic interpreter, guarded real-browser driver, readiness probe, and handwritten persistence
vertical slice are built and tested. Recorder and CLI acquisition are not built yet.

## Locked Decisions

- Name: MergeVow.
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
  not the MergeVow PR Drift Gate and provides no artifact-selection or isolation guarantee.
- `AGENTS.md` for repository agents.
- Version-controlled `build-mergevow` skill and a validated personal installation.
- MIT license, contributing guide, and security policy.

## Verified Locally

- `pnpm install`
- `pnpm browser:install`
- `pnpm check`
- `pnpm audit --audit-level low`: no known vulnerabilities
- `@mergevow/contract`: 43 Vitest cases covering schema, hostile inputs, canonicalization, and hash
- Contract package typecheck, clean build, package dry-run, and built-ESM parser smoke
- `@mergevow/playwright-driver`: 48 real-Chromium and readiness cases covering all 14 driver methods,
  semantic locators, cancellation, assertion mismatch, loopback readiness, and the loopback
  origin validation, proxy and cookie isolation, requests, redirects, transport failures,
  unsupported realtime/worker APIs, and Service Worker blocking
- Playwright-driver typecheck, clean build, and package dry-run
- `@mergevow/interpreter`: 14 cases covering all opcode dispatch, exact regression output, driver
  failure/protocol, cancellation, per-step/total timeout, and invalid boundary inputs
- Interpreter typecheck, clean build, package dry-run, and built-ESM state-machine smoke
- `@mergevow/demo-todo-persistence`: 3 vertical-slice/report cases plus a runnable
  `PASS / PASS / REGRESSION` demo using fresh contexts
- Source and built JSON Schema SHA-256 equality
- Chromium launch and semantic heading lookup
- All project-relative Markdown links
- Skill validator for source and installed copies
- Independent skill forward-test against `SW-002`; it enforced dependencies, scope, and security
  boundaries and found a contract-example inconsistency that was corrected

## Published

- Public repository: [datzle123/MergeVow](https://github.com/datzle123/MergeVow).
- Repository CI, Issues, Discussions, security reporting, and project topics are enabled.
- Squash-only merging, default-branch rules, CodeQL, Dependabot alerts, secret scanning, and push
  protection are enabled; ADR-0009 records the ordinary-governance boundary.

## External Setup Still Required

These require the owner's accounts or identity and were intentionally not guessed:

- Reserve the npm package/scope.
- Choose a domain and perform trademark checks.
- Recruit and schedule the first five interview/pilot candidates.

## Next Action

`SW-001` through `SW-007` are complete. Open `docs/BACKLOG.md` and start `SW-008` while keeping the
handwritten vertical slice as the recorder's acceptance oracle.
