# Threat Model And Public Guarantees

Status: Locked for V0 by `SW-001`<br>
Last reviewed: 2026-07-19

This document is the canonical source for MergeVow security and integrity claims. Product copy,
ADRs, issues, and implementation must not promise more than the guarantees below.

## Terms

- **Candidate:** PR head code, its dependencies, and every artifact controlled by that change.
- **Accepted base bundle:** the contracts, config, and schema stored at one exact base commit SHA. Its
  presence in the repository means it was previously accepted by repository process; it is not proof
  of explicit human approval.
- **Proposed bundle:** the candidate/head version of any governed contract or config. V0 reports it
  but never uses it as the active PR oracle.
- **Canonical contract hash:** SHA-256 of the validated RFC 8785 canonical Contract V1 JSON, written
  as `sha256:<lowercase hex>`.
- **Attested bundle:** a proposed bundle explicitly approved by an authorized maintainer through
  Protected Attestation.
- **Oracle:** the accepted base bundle plus the immutable runner and policy semantics used to produce
  a verdict.
- **Evidence:** screenshots, traces, console output, URLs, and network metadata. Evidence explains a
  verdict but never defines pass or fail, and every evidence bundle is treated as sensitive.

**Human-owned** is a product-governance principle. **Human-approved** is reserved for an attested
bundle; MergeVow does not infer approval from branch location or prove that an approver is
competent.

## Actors And Assumptions

- The local contract author chooses the app and oracle in Local Cooperative mode.
- The PR author, coding agent, candidate app, candidate dependencies, head contracts, browser output,
  PR-authored metadata, and report fields are untrusted.
- Repository maintainers and the configured enforcement owner are trusted for policy decisions.
- Trusted event metadata supplies the GitHub PR base SHA. GitHub, the selected CI control plane,
  runner host, pinned MergeVow release, host kernel, and release publisher are trusted
  infrastructure for the V0 PR Drift Gate.
- Evidence viewers must handle reports as sensitive untrusted content. External services are not
  trusted with credentials or unrestricted traffic.
- PR Drift Gate assumes candidate execution does not attack its runner or control plane. Candidate
  code executing as the same OS user may forge, suppress, or corrupt a result. Separate directories
  help provenance and cleanup; they are not process isolation.

Malicious repository administrators, compromised trusted infrastructure, browser zero-days, and
runner escapes are outside every stated guarantee.

## Guarantee Matrix

| Level | Availability | Oracle source | Narrow guarantee | Explicit exclusions |
|---|---|---|---|---|
| **Local Cooperative** | Workspace vertical slice; unreleased | Current local contract/config and workspace runner | Replays selected checkpoints and reports observed drift | No ownership, approval, tamper resistance, CI enforcement, or protection from workspace writers |
| **PR Drift Gate** | V0 target after `SW-015` | Accepted bundle from one exact base SHA; runner/action and policy from a recorded immutable release digest | **If the configured check executes as specified and the trusted infrastructure remains intact**, head contract/config edits cannot alter the oracle for that invocation; proposals are reported separately | No explicit human attestation, workflow/check-bypass defense, hostile-code isolation, admin defense, or anti-automation defense |
| **Protected Attestation** | Post-V0 after `SW-023` | Externally enforced oracle plus an attested proposed bundle and isolated ephemeral execution | Candidate code cannot alter the oracle, approval, or check implementation; any bound-input change invalidates approval | No protection from authorized malicious organization admins, compromised trusted dependencies/platforms, browser zero-days, or runner escapes |

The unqualified statement “an agent cannot edit the definition of done” is valid only for Protected
Attestation. For PR Drift Gate, say: “head contract edits cannot replace the base-selected oracle
inside the configured check.” Local mode is never described as tamper-proof.

## Availability

- The repository contains a tested end-to-end Local Cooperative workspace demo and an unreleased
  workspace action recorder. It has no published package, checkpoint UI, configured redaction, or
  CLI yet.
- PR Drift Gate remains a V0 target and is not implemented.
- Protected Attestation is post-V0 and must not be advertised as available before external
  enforcement, isolated execution, and bound-approval acceptance tests pass.

## Oracle Provenance

- On GitHub, read `pull_request.base.sha` from trusted event metadata once, record it in the result,
  and fail closed if it is absent or cannot be fetched. Never fall back to a branch name or head.
- For local `--base <ref>`, resolve the ref to one immutable commit SHA before loading artifacts,
  record that SHA, and fail closed if resolution changes or fails.
- Load the accepted contract/config/schema bundle only from that SHA. Load runner/action semantics
  from one recorded immutable release digest, never candidate dependencies.
- Record the repository, base SHA, head SHA, governed-bundle digest, and runner/policy digest with the
  result so the invocation can be reproduced and audited.

Protected approval binds at least the repository identity, pull request, base SHA, accepted-bundle
digest, head SHA, proposed-bundle digest, runner/action digest, policy/schema version, approver
identity, and authorization decision. A change to any bound field invalidates approval.

## Replay And Governance Results

Replay and contract governance are independent axes:

- `executionVerdict`: `PASS | REGRESSION | FLAKY | INFRA_ERROR`.
- `proposalStatus`: `UNCHANGED | CHANGE_REQUIRES_APPROVAL`; Protected Attestation may additionally
  produce `APPROVED`.

Any add, edit, delete, rename, symlink change, or config change in the governed head bundle produces
`CHANGE_REQUIRES_APPROVAL` regardless of replay outcome. A passing base replay plus a weakened head
contract is therefore `PASS + CHANGE_REQUIRES_APPROVAL`; a failing base replay plus a proposal is
`REGRESSION + CHANGE_REQUIRES_APPROVAL`. V0 has no `APPROVED` transition, so proposals remain
blocking and never become the active oracle automatically.

## Required Controls

### All Modes

- Contracts are versioned, data-only, size/depth bounded, and reject unknown fields.
- Report fields are escaped before rendering. Evidence retention is bounded.
- MergeVow does not intentionally serialize cookies, authorization headers, or browser storage
  state. It rejects password-control capture; configured pre-persistence redaction remains an
  `SW-010` requirement and is not advertised as available yet.
- Network response bodies are excluded from evidence by default. Use synthetic test data and assume
  arbitrary page, URL, console, and screenshot content may still contain secrets.
- Retry may classify `FLAKY`; it never converts failure into `PASS`.
- Local replay uses a fresh guarded context, checks retained policy and transport failure before and
  after every browser operation, and never exports or reuses browser storage state.
- Local recording uses a fresh guarded context and returns no partial contract after a fatal event.
  It rejects password controls before reading their value. Contracts have no fields for cookies,
  authorization headers, raw request/response bodies, local/session storage, or Playwright storage
  state. The guarded driver still relays same-origin headers and bodies; URL, locator, and value text
  derived from the page can contain sensitive data and remains subject to the SW-010 redaction work.

### PR Drift Gate

- Use `pull_request`, not `pull_request_target`, to execute candidate code.
- Give candidate code no repository secrets, writable token, credential helper, or privileged cache.
- Use an ephemeral hosted runner that is not attached to privileged internal networks. Persistent
  self-hosted runners are unsupported for untrusted PRs unless the deployment owner independently
  isolates them.
- Separate base artifacts and candidate source for provenance, while making no isolation claim about
  those workspaces.
- Resolve the accepted bundle from the exact base SHA and runner semantics from an immutable digest.
- Use a fresh Service-Worker-free browser context. Route document, subresource, and fetch HTTP(S)
  traffic through a proxy-free, cookie-isolated transport that checks every redirect target against
  one exact loopback origin. Override launch proxies with an owned loopback deny proxy and reject
  WebSocket, EventSource, WebTransport, WebRTC, and dedicated/shared worker APIs as unsupported.
  This request/API policy is not a complete browser-egress boundary and does not restrict
  browser-internal or future channels, candidate-process, dependency-install, DNS, or OS egress.
- Report all missing, modified, or proposed head artifacts without using them as the active oracle.

### Protected Attestation

- The enforcement definition and approval store live outside candidate control.
- Candidate execution occurs in an ephemeral, secretless isolated environment with OS/container
  egress, CPU, memory, process, disk, and wall-time limits.
- A privileged approval workflow never checks out, imports, or executes candidate code.
- Approval uses the full binding defined under Oracle Provenance. Any bound-input change invalidates
  it.

## Threats And Disposition

| Threat | Disposition |
|---|---|
| Candidate weakens, deletes, renames, or adds a governed head artifact | Keep the accepted base oracle and emit `CHANGE_REQUIRES_APPROVAL`, independent of replay verdict |
| Candidate edits or bypasses the repository workflow | Not solved by PR Drift Gate; requires Protected Attestation outside candidate control |
| Candidate attacks the same-user runner or forges a result | Outside PR Drift Gate; Protected Attestation requires isolated execution and external verification |
| Candidate app or dependency exfiltrates data | V0 supplies no credentials, restricts routed browser requests, and rejects listed realtime/worker APIs, but does not claim complete browser/process egress control or a sandbox |
| Contract adds executable behavior | Reject through the closed data-only schema and fixed interpreter |
| Evidence contains secrets or script markup | Treat as sensitive, redact configured patterns, omit bodies by default, and escape before rendering; perfect detection is not guaranteed |
| Intentional behavior change | Preserve the base replay verdict and separately emit `CHANGE_REQUIRES_APPROVAL`; never activate head automatically |
| Flaky replay passes on retry | Report `FLAKY`, not `PASS` |

## V0 Product And Security Non-Goals

- Replacing unit, integration, accessibility, security, or full E2E suites.
- Formal verification, autonomous QA, or proof of full-stack/backend correctness.
- Browsers other than pinned Chromium, native-mobile flows, or desktop-application flows.
- Pixel screenshots as the pass/fail oracle.
- Production traffic or session recording.
- MFA, passkeys, third-party SSO, or committed cookies/raw `storageState`.
- WebSocket, SSE/EventSource, service worker, dedicated/shared web worker, WebTransport, WebRTC,
  multi-tab, cross-origin iframe, or real-time collaborative flows.
- Arbitrary JavaScript, shell, imports, callbacks, XPath, arbitrary CSS selectors, or executable
  regex in contracts.
- AI self-healing or automatic contract approval.
- HTTP-service or command-process behavior contracts. MergeVow's own `init`, `record`, `check`, and
  `diff` CLI remains in scope.
- A hosted dashboard, IDE extension, or MCP integration.
- A security sandbox, hostile-candidate isolation, or defense against an app deliberately detecting
  or attacking browser automation.
- Protecting credentials deliberately exposed to candidate code, or guaranteeing arbitrary app/user
  content and evidence are secret-free.
- Protection from malicious maintainers/admins, compromised trusted dependencies/platforms, browser
  zero-days, or runner escapes.

## Security Completion Rule

Any change to contract parsing, governed-bundle selection, evidence capture, network policy,
approval, GitHub permissions, or the guarantee matrix requires security tests and a threat-model
review before merge. A stronger guarantee requires a new ADR and executable acceptance tests; copy
changes alone cannot promote a trust level.
