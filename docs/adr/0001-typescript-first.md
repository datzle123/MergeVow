# ADR-0001: TypeScript First

Status: Accepted<br>
Date: 2026-07-18

## Context

MergeVow depends on Playwright, browser/CDP integration, an `npx` acquisition path, GitHub Actions,
JSON contracts, and static HTML reports. Contributor installation friction matters more than native
runtime performance in V0.

## Decision

Use TypeScript strict mode for the contract model, interpreter, Playwright driver, recorder,
reporter, CLI, and JavaScript GitHub Action.

Do not start with a TypeScript/Rust split.

## Rust Trigger

Consider a Rust component only when a measured requirement justifies it, such as an isolated process
supervisor, sandbox daemon, large-scale evidence processing, or a cross-platform single-binary helper
that cannot be delivered acceptably through Node.js.

## Consequences

- Fastest path through the official Playwright and GitHub Action ecosystems.
- Lowest installation friction for the initial web-developer ICP.
- One language across product surfaces during validation.
- Native sandboxing and process isolation remain future, evidence-driven decisions.

## Guarantee Impact

This language choice does not promote a trust level or isolate same-user candidate processes. A
JavaScript Action defined inside candidate control is not Protected Attestation merely because its
runtime is pinned. All integrity claims must follow the canonical matrix in
[`../THREAT_MODEL.md`](../THREAT_MODEL.md).
