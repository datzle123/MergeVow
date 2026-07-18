# Initial Backlog

## Milestone 0: Preparation

- [x] Product charter and project plan.
- [x] Threat model baseline.
- [x] TypeScript-first architecture decision.
- [x] Public guarantee matrix and non-goals (`SW-001`).
- [x] Validation and launch kit.
- [x] Codex project skill.
- [x] Create the public GitHub repository.
- [ ] Reserve the npm package/scope.
- [ ] Recruit five pilot candidates.

## Completed Issues

### SW-001: Lock Guarantees And Non-Goals

**Status:** Complete on 2026-07-18.

**Objective:** Turn the threat-model draft into the public contract for V0.

**Acceptance criteria:**

- Three trust levels are reviewed and internally consistent.
- Every V0 non-goal appears in README and threat model.
- A security reviewer cannot confuse PR drift detection with malicious-code isolation.
- ADRs reference the final guarantees.

**Outcome:** `docs/THREAT_MODEL.md` is the canonical public contract. ADR-0004 separates artifact
selection, explicit approval, and hostile-code isolation. README, charter, plan, ADRs, backlog, and
agent skill use the same three trust levels and V0 non-goals. Replay verdict and proposal governance
are independent.

### SW-002: Define Contract Schema V1

**Status:** Complete on 2026-07-19.

**Objective:** Create the smallest data model capable of the persistence vertical slice.

**Acceptance criteria:**

- JSON Schema uses `additionalProperties: false`.
- Supports only the approved V0 action, locator, and assertion opcodes.
- Rejects executable surfaces, external navigation, excessive size, and excessive depth.
- Includes valid, invalid, and malicious fixtures.

**Outcome:** `@stillworks/contract` publishes a closed JSON Schema 2020-12 document, matching strict
TypeScript types, bounded fail-closed parsing, and 30 tests across valid, invalid, and malicious
inputs. Duplicate decoded keys, dangerous prototype keys, invalid Unicode/UTF-8, executable fields,
external URL operands, and all named resource limits are rejected without mutating input.

### SW-003: Canonical Serialization And Hash

**Status:** Complete on 2026-07-19.

**Objective:** Give validated contracts a stable cross-platform content identity.

**Acceptance criteria:** identical semantic JSON produces the same hash across supported platforms;
invalid JSON values fail closed.

**Outcome:** validated contracts use RFC 8785 canonical JSON and SHA-256 identities formatted as
`sha256:<lowercase hex>`. Twelve golden, mutation, and negative tests prove property-order/whitespace
stability, behavior-change sensitivity, JSON escaping and negative-zero handling, explicit Unicode
behavior, inert snapshotting, and fail-closed invalid input. Repository CI runs the suite on Linux,
Windows, and macOS.

### SW-004: Semantic Locator Resolver

**Status:** Complete on 2026-07-19. See [GitHub issue #2](https://github.com/datzle123/StillWorks/issues/2).

**Objective:** Resolve role/name, label, and test ID without silently healing ambiguity.

**Acceptance criteria:** stable DOM refactors pass; ambiguous and missing locators fail with clear
evidence.

**Outcome:** `@stillworks/playwright-driver` maps only the three approved Contract V1 locator
strategies to exact Playwright queries. Unique resolution returns a live locator only for one match;
zero and multiple matches return structured `LOCATOR_MISSING` or `LOCATOR_AMBIGUOUS` evidence.
Count observation remains separate for `assertCount`, while Playwright errors propagate for the
future interpreter to classify. Ten real-Chromium tests cover semantic refactors, exactness,
malformed input, missing, ambiguity, count, browser failure, and strict live-locator behavior without
CSS/XPath/regex fallback or self-healing.

### SW-005: Interpreter State Machine

**Status:** Complete on 2026-07-19. See [GitHub issue #4](https://github.com/datzle123/StillWorks/issues/4).

**Objective:** Replay a handwritten contract deterministically.

**Acceptance criteria:** cancellation, per-step timeout, total timeout, typed result states, and exact
failing-step output are covered.

**Outcome:** `@stillworks/interpreter` validates and freezes Contract V1, dispatches all 14 opcodes
through explicit driver methods in source order, and stops on the first failure. Fourteen controlled
tests cover `PASS`, exact-step `REGRESSION`, driver/protocol `INFRA_ERROR`, external cancellation,
per-step and total timeout, trusted policy bounds, malformed contracts, and prototype-polluted
opcodes. Results contain no timestamp or duration. The interpreter performs no retry and never emits
`FLAKY`; ADR-0006 records the boundary.

## Ready Issues

### SW-006: Same-Origin Guard

**Status:** Complete on 2026-07-19. See [GitHub issue #6](https://github.com/datzle123/StillWorks/issues/6).

**Objective:** Prevent contracts from becoming an unrestricted browser/network executor.

**Acceptance criteria:** allowlisted localhost works; external navigation and requests fail closed;
redirect behavior is tested.

**Outcome:** `@stillworks/playwright-driver` creates a Service-Worker-free context for one exact
HTTP(S) loopback origin. A fresh direct request client per routed request preserves cookie
credentials semantics and avoids inherited launch proxies; every redirect `Location` is checked.
An owned loopback deny proxy and unsupported-API policy reject non-routed proxy traffic, WebSockets,
EventSource, WebTransport, WebRTC, and dedicated/shared workers. Policy violations and transport
failures are frozen, bounded, and separate, while owned closure prevents route errors from escaping.
Nineteen real-Chromium guard tests use only controlled loopback servers. ADR-0007 records why this is
request/API policy rather than a complete browser or network sandbox.

### SW-007: Persistence Vertical Slice

**Objective:** Prove the core value before recorder work.

**Acceptance criteria:** a handwritten contract runs in Chromium, a semantic refactor passes, a
persistence bug fails after reload, and a minimal report explains the failure.

## Planned Issues

| ID | Deliverable | Depends on |
|---|---|---|
| SW-008 | Recorder action capture | SW-004, SW-007 |
| SW-009 | Checkpoint/assertion overlay | SW-008 |
| SW-010 | Sensitive-input redaction | SW-008 |
| SW-011 | Screenshot, console, and trace evidence | SW-005 |
| SW-012 | Semantic contract diff | SW-003 |
| SW-013 | CLI `init`, `record`, `check`, `diff` | SW-009, SW-011 |
| SW-014 | Exact base-SHA contract/config/schema loader | SW-003 |
| SW-015 | Read-only PR GitHub Action | SW-014 |
| SW-016 | Independent proposal status for all governed head-bundle changes | SW-012, SW-015 |
| SW-017 | Malicious-contract fuzz suite | SW-002, SW-006 |
| SW-018 | Three demo apps and mutation corpus | SW-013, SW-015 |
| SW-019 | Cross-platform and 100-run soak | SW-018 |
| SW-020 | npm provenance and release automation | SW-017, SW-019 |
| SW-021 | Public quickstart and enforcement docs | V0 complete |
| SW-022 | Fully bound maintainer approval record | Post-V0 demand gate |
| SW-023 | External enforcement and isolated ephemeral execution | Protected-enforcement gate |
