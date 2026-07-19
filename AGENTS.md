# MergeVow Agent Instructions

## Read First

Before changing code or architecture:

1. Read `PROJECT_PLAN.md`.
2. Read `docs/PRODUCT_CHARTER.md` and `docs/THREAT_MODEL.md`.
3. Find the active `SW-*` item in `docs/BACKLOG.md`.
4. Use the `build-mergevow` skill when it is available.

## Current State

The repository is prepared and `SW-001` through `SW-008` are complete. `SW-009` is the next issue.
Do not create broad framework code ahead of the active issue. The first
vertical slice must precede recorder polish, GitHub App work, dashboards, HTTP-service or
command-process contract targets, or MCP integration. This does not exclude MergeVow's own CLI.

## Invariants

- Use TypeScript strict mode for V0.
- Keep contracts declarative and data-only.
- Reject unknown contract fields; use `additionalProperties: false`.
- Do not add JavaScript, shell, imports, callbacks, XPath, or arbitrary CSS selectors to contracts.
- Prefer role/accessibility name, label, and test ID locators.
- Treat screenshots, video, console output, and traces as evidence, never the pass/fail oracle.
- Keep replay verdict and proposal governance independent. Every governed head-bundle change requires
  approval even when the base replay passes.
- Never turn a failed contract into pass because a retry succeeds; classify it as flaky.
- Never run candidate code with repository secrets or a writable GitHub token.
- Do not use `pull_request_target` to execute candidate code.
- State guarantees and non-goals honestly in user-facing docs.

## Workflow

- Keep one issue per bounded change.
- Write human acceptance criteria before implementation.
- Add tests proportional to the trust boundary touched.
- Update an ADR when changing a durable architecture decision.
- Run `pnpm check` before completing a change.
- Report skipped verification and residual risk explicitly.

## Scope Guard

Do not add another boundary until MergeVow has at least 10 weekly-active browser repositories and
three organic adapter requests. Do not implement protected GitHub enforcement before authoring and
replay reliability have passed their gates.
