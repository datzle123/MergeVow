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

**Outcome:** `@mergevow/contract` provides a closed JSON Schema 2020-12 document, matching strict
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

**Status:** Complete on 2026-07-19. See [GitHub issue #2](https://github.com/datzle123/MergeVow/issues/2).

**Objective:** Resolve role/name, label, and test ID without silently healing ambiguity.

**Acceptance criteria:** stable DOM refactors pass; ambiguous and missing locators fail with clear
evidence.

**Outcome:** `@mergevow/playwright-driver` maps only the three approved Contract V1 locator
strategies to exact Playwright queries. Unique resolution returns a live locator only for one match;
zero and multiple matches return structured `LOCATOR_MISSING` or `LOCATOR_AMBIGUOUS` evidence.
Count observation remains separate for `assertCount`, while Playwright errors propagate for the
future interpreter to classify. Ten real-Chromium tests cover semantic refactors, exactness,
malformed input, missing, ambiguity, count, browser failure, and strict live-locator behavior without
CSS/XPath/regex fallback or self-healing.

### SW-005: Interpreter State Machine

**Status:** Complete on 2026-07-19. See [GitHub issue #4](https://github.com/datzle123/MergeVow/issues/4).

**Objective:** Replay a handwritten contract deterministically.

**Acceptance criteria:** cancellation, per-step timeout, total timeout, typed result states, and exact
failing-step output are covered.

**Outcome:** `@mergevow/interpreter` validates and freezes Contract V1, dispatches all 14 opcodes
through explicit driver methods in source order, and stops on the first failure. Fourteen controlled
tests cover `PASS`, exact-step `REGRESSION`, driver/protocol `INFRA_ERROR`, external cancellation,
per-step and total timeout, trusted policy bounds, malformed contracts, and prototype-polluted
opcodes. Results contain no timestamp or duration. The interpreter performs no retry and never emits
`FLAKY`; ADR-0006 records the boundary.

### SW-006: Same-Origin Guard

**Status:** Complete on 2026-07-19. See [GitHub issue #6](https://github.com/datzle123/MergeVow/issues/6).

**Objective:** Prevent contracts from becoming an unrestricted browser/network executor.

**Acceptance criteria:** allowlisted localhost works; external navigation and requests fail closed;
redirect behavior is tested.

**Outcome:** `@mergevow/playwright-driver` creates a Service-Worker-free context for one exact
HTTP(S) loopback origin. A fresh direct request client per routed request preserves cookie
credentials semantics and avoids inherited launch proxies; every redirect `Location` is checked.
An owned loopback deny proxy and unsupported-API policy reject non-routed proxy traffic, WebSockets,
EventSource, WebTransport, WebRTC, and dedicated/shared workers. Policy violations and transport
failures are frozen, bounded, and separate, while owned closure prevents route errors from escaping.
Nineteen real-Chromium guard tests use only controlled loopback servers. ADR-0007 records why this is
request/API policy rather than a complete browser or network sandbox.

### SW-006A: Establish A Publishable MergeVow Identity

**Status:** Complete on 2026-07-19. See
[GitHub issue #8](https://github.com/datzle123/MergeVow/issues/8).

**Objective:** Replace the collided project/package identity before adding more public API surface.

**Acceptance criteria:** repository, packages, imports, schema identifier, config paths, docs, and
project skill use one consistent identity; no npm/domain ownership is claimed before reservation.

**Outcome:** The project is `MergeVow`, the repository is `datzle123/MergeVow`, prospective workspace
packages use `@mergevow/*`, the future CLI is `mergevow`, and local run state lives under
`.mergevow/`. ADR-0008 records the availability snapshot, decision, and unreserved namespace/domain
limitation. The checkout moved into the configured Codex workspace instead of using drive F.

### SW-006B: Establish Repository Governance And Security Baseline

**Status:** Complete on 2026-07-19. See
[GitHub issue #10](https://github.com/datzle123/MergeVow/issues/10).

**Objective:** Protect the public repository without deadlocking its solo maintainer or overstating
ordinary GitHub controls as a MergeVow trust level.

**Acceptance criteria:** squash-only merging, a no-bypass default-branch ruleset, strict three-platform
CI, SHA-pinned GitHub-owned Actions, private reporting, security scanning, dependency alerts, community
health files, and corrected roadmap dependencies are active and API-verified.

**Outcome:** ADR-0009 records the solo-safe policy and its limitations. Repository settings enforce
the three existing CI contexts and CodeQL thresholds, while contribution and security routes live in
version control. Required human approval remains gated on a second maintainer.

### SW-007: Persistence Vertical Slice

**Status:** Complete on 2026-07-19. See
[GitHub issue #13](https://github.com/datzle123/MergeVow/issues/13).

**Objective:** Prove the core value before recorder work.

**Acceptance criteria:** a handwritten contract runs in Chromium, a semantic refactor passes, a
persistence bug fails after reload, and a minimal report explains the failure.

**Outcome:** `@mergevow/playwright-driver` implements all 14 operations, bounded no-redirect
readiness, cancellation cooperation, deterministic semantic mismatches, and before/after guard
checks. One seven-step todo contract passes baseline and semantic-refactor variants in fresh
contexts; broken persistence returns `REGRESSION` with `LOCATOR_MISSING` at step 6. The escaped Local
Cooperative terminal summary contains no time-dependent fields. ADR-0010 records the boundary.

### SW-007A: Deterministic Page Topology Observation

**Status:** Complete on 2026-07-19. See
[GitHub issue #15](https://github.com/datzle123/MergeVow/issues/15).

**Objective:** Remove the platform race in fixed-delay popup observation.

**Acceptance criteria:** an explicit Chromium target barrier retains open and immediately closed
auxiliary pages without wall-clock settlement; repeated driver runs and three-platform CI pass.

**Outcome:** the driver discovers page targets for the exact browser-context ID, retains target
creation events, and snapshots current targets before and after every operation. This removes the
50 ms heuristic exposed by post-merge Windows CI while preserving truthful current/maximum evidence.

### SW-008: Recorder Action Capture

**Status:** Complete on 2026-07-19. See
[GitHub issue #17](https://github.com/datzle123/MergeVow/issues/17).

**Objective:** Capture the approved action subset from one headed Chromium page without creating an
executable contract surface.

**Acceptance criteria:** a user can capture visit, click, fill, select, check, and reload actions as
Contract V1 data; unsupported, sensitive, ambiguous, external, framed, and multi-page activity fails
closed with no partial contract.

**Outcome:** `@mergevow/recorder` owns a fresh guarded context, captures bounded standards-based
event-time semantic locator proofs, opportunistically rechecks live elements with Playwright,
coalesces fills by element identity, and correlates click navigation through main-frame requests.
Password, file, uncheck, implicit/programmatic submit, unsupported input, invalid/ambiguous locator,
resource, guard, frame, startup, and target failures expose one bounded issue and no partial
contract. ADR-0011 records the cooperative authoring boundary.

## Ready Issues

### SW-009: Checkpoint And Assertion Overlay

**Objective:** Let a developer add meaningful Contract V1 assertions during a recording without
editing JSON.

**Acceptance criteria:** a headed Chromium overlay selects the approved visible, hidden, URL, text,
value, count, checked, and disabled checkpoints with exact semantic locators and bounded values; the
overlay does not alter application behavior or create executable contract fields, and cancel/invalid
selection never emits a partial assertion.

## Planned Issues

| ID | Deliverable | Depends on |
|---|---|---|
| SW-010 | Sensitive-input redaction | SW-008 |
| SW-011 | Screenshot, console, and trace evidence | SW-005, SW-007 |
| SW-012 | Semantic contract diff | SW-003 |
| SW-013 | CLI `init`, `record`, `check`, `diff` | SW-009, SW-010, SW-011, SW-012 |
| SW-014 | Exact base-SHA contract/config/schema loader | SW-003, SW-013 |
| SW-015 | Read-only PR GitHub Action | SW-014 |
| SW-016 | Independent proposal status for all governed head-bundle changes | SW-012, SW-015 |
| SW-017 | Malicious-contract fuzz suite | SW-002, SW-006 |
| SW-018 | Three demo apps and mutation corpus | SW-013, SW-015, SW-016 |
| SW-019 | Cross-platform and 100-run soak | SW-018 |
| SW-020 | npm provenance and release automation | SW-017, SW-019 |
| SW-021 | Public quickstart and enforcement docs | SW-016, SW-019, SW-020 |
| SW-022 | Fully bound maintainer approval record | SW-021, post-V0 demand gate |
| SW-023 | External enforcement and isolated ephemeral execution | SW-022, protected-enforcement gate |
