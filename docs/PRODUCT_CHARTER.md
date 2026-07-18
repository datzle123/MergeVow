# Product Charter

## Mission

Make critical user behavior explicit, replayable, and human-owned as software changes accelerate.

## Promise

> Show a critical flow once, select the outcomes that matter, and keep checking that behavior as
> the code changes.

Local mode checks the contract selected by the current user and makes no approval guarantee. The V0
PR Drift Gate uses a base-selected oracle for one configured invocation. Explicit human approval is
reserved for post-V0 Protected Attestation, as defined in
[`THREAT_MODEL.md`](THREAT_MODEL.md).

## Why MergeVow Exists

1. General developers need a faster bridge from manual browser checks to durable regression tests.
2. Human and agent-authored PRs can change implementation and verification together; accepted
   behavior needs an oracle outside the candidate patch.
3. Reviewers need understandable evidence, not only a green status or generated explanation.

## Initial User

Senior full-stack engineers and tech leads in 2-15 engineer teams shipping TypeScript web apps with
GitHub Actions, incomplete E2E coverage, and at least one deterministic flow they still verify
manually.

## V0 Outcome

A developer records one loginless Chromium flow, selects 3-8 semantic checkpoints, replays it
locally, and configures a PR check that evaluates candidate code with the oracle selected from one
exact base SHA. This is an artifact-selection drift guarantee, not proof of human approval or a
malicious-code sandbox guarantee.

## Product Principles

- Human-selected outcomes beat generated assertions.
- Semantic behavior beats DOM shape and pixels.
- Evidence explains the verdict but does not replace the oracle.
- Intentional changes require explicit review.
- Narrow reliability beats broad protocol support.
- Guarantees must match the actual trust boundary.

## North Star

Weekly repositories running MergeVow on at least three PRs within 14 days.

## V0 Non-Goals

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

The canonical security wording and complete exclusions live in
[`THREAT_MODEL.md`](THREAT_MODEL.md).
