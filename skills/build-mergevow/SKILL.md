---
name: build-mergevow
description: Build and maintain the MergeVow open-source project while preserving its human-owned behavior-contract model. Use when Codex works on the MergeVow product charter, JSON contract schema, canonical hashing, semantic locator resolution, deterministic interpreter, Playwright driver or recorder, evidence reports, CLI, Git merge-base behavior, GitHub Action/App enforcement, security hardening, validation experiments, benchmarks, releases, or issue planning in the MergeVow repository.
---

# Build MergeVow

Build the smallest approved MergeVow issue without weakening the definition-of-done boundary.

## Start Every Task

1. Locate the MergeVow repository root.
2. Read `AGENTS.md`, `docs/PRODUCT_CHARTER.md`, and `docs/THREAT_MODEL.md`.
3. Find the active `SW-*` issue in `docs/BACKLOG.md`.
4. Read the relevant ADR and demo spec.
5. Restate the human acceptance criteria and trust level before editing.

If no bounded issue or acceptance criteria exist, create or refine them before implementation.

## Respect The Delivery Order

Follow this dependency chain:

```text
Pain -> Authoring experience -> Replay reliability -> PR drift gate -> Protected enforcement
```

Do not implement recorder polish before the handwritten-contract vertical slice. Do not implement a
GitHub App, hosted dashboard, HTTP-service or command-process contract target, IDE extension, or MCP
surface before its demand gate. MergeVow's own CLI remains in V0 scope.

## Preserve Product Invariants

- Use TypeScript strict mode for V0.
- Keep contracts versioned, declarative, and data-only.
- Reject unknown fields and fail closed on malformed input.
- Do not add JavaScript, shell, imports, callbacks, XPath, arbitrary CSS selectors, or executable
  regex to contracts.
- Prefer role/accessibility name, label, and test ID locators.
- Fail on missing or ambiguous locators; never silently self-heal.
- Treat screenshot, video, console, network log, and trace as evidence, not the oracle.
- Keep replay and governance independent: `executionVerdict` is
  `PASS | REGRESSION | FLAKY | INFRA_ERROR`; `proposalStatus` is
  `UNCHANGED | CHANGE_REQUIRES_APPROVAL` in V0.
- Treat every governed head-bundle add, edit, delete, rename, symlink, or config change as
  `CHANGE_REQUIRES_APPROVAL`, even when replay passes. Never activate it automatically.
- Never convert failure to pass because a retry succeeds.
- Never execute candidate code with secrets or a writable GitHub token.
- Never use `pull_request_target` to run candidate code.
- Describe the actual trust level. A PR Drift Gate protects artifact selection only when its
  configured check runs as specified; do not market it as human approval, hostile-code isolation, or
  tamper-proof enforcement.

Read `references/review-checklist.md` before changing schema, interpreter, evidence capture, Git
selection, network policy, approval, or CI permissions.

## Implement An Issue

1. Inspect existing code and current worktree state.
2. Identify the narrow ownership boundary for the change.
3. Add a failing fixture/test for the human acceptance criterion.
4. Implement the smallest complete behavior.
5. Add negative and security cases proportional to the boundary touched.
6. Update the contract spec, threat model, or ADR when behavior or guarantees change.
7. Run `pnpm check` and the relevant integration/soak commands.
8. Report verification, skipped checks, and residual risk.

Use structured parsers and schema validators. Invoke Git and processes with argument arrays, never
interpolated shell commands. Treat evidence as sensitive, escape report content, and apply configured
redaction before persistence without promising perfect secret detection.

## Review A Change

Lead with behavioral regressions, trust-boundary violations, bypasses, flakiness, secret exposure,
and missing tests. Check whether a head artifact can influence the exact-base oracle or whether a
governed change avoids proposal review. Check whether a "convenience" feature creates an executable
contract surface or turns provenance-separated directories into a false isolation claim.

Do not approve architecture breadth merely because implementation is easy for an agent.

## Complete A Task

A task is complete only when its acceptance criteria are demonstrated, relevant tests pass, docs
match behavior, and the stated guarantee is no stronger than the implementation.
