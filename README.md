# StillWorks

**Show it once. Keep it working.**

StillWorks is an open-source project for human-owned behavior contracts in CI. A developer
demonstrates a critical browser flow, selects the semantic outcomes that matter, and checks
candidate code with a selected local contract or a base-selected PR oracle.

> Your agent can edit the code, not silently redefine done.

That unqualified claim is the post-V0 target for Protected Attestation. V0 has a narrower promise:
when the configured PR Drift Gate executes as specified, head contract/config edits cannot replace
the base-selected oracle for that invocation. It is an artifact-selection guarantee, not hostile-code
isolation or proof of human approval. See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Project Status

**Preparation and Contract Schema V1 are complete. Browser replay has not started.**

The repository contains the product charter, threat model, execution plan, validation kit, demo
specifications, development toolchain, Codex skill, and the first tested product package:
`@stillworks/contract`.

## Start Here

1. Read [PROJECT_PLAN.md](PROJECT_PLAN.md).
2. Check [READY_TO_START.md](READY_TO_START.md).
3. Read [AGENTS.md](AGENTS.md) before using a coding agent.
4. Review [docs/BACKLOG.md](docs/BACKLOG.md).
5. Continue with `SW-003`, then implement the Week 2 vertical slice before the recorder.

## Setup

```bash
corepack enable
pnpm install
pnpm check
```

Node.js 24+ and pnpm 11 are the prepared baseline.

## V0 Boundary

V0 uses TypeScript, pinned Chromium, deterministic loginless web flows, data-only contracts, and
semantic locators. Screenshots and traces are sensitive evidence, not the oracle.

V0 explicitly does not include:

- Replacing unit, integration, accessibility, security, or full E2E suites.
- Formal verification, autonomous QA, or proof of full-stack/backend correctness.
- Browsers other than pinned Chromium, native-mobile flows, or desktop-application flows.
- Pixel screenshots as the pass/fail oracle.
- Production traffic or session recording.
- MFA, passkeys, third-party SSO, or committed cookies/raw `storageState`.
- WebSocket, SSE, service worker, multi-tab, cross-origin iframe, or real-time collaborative flows.
- Arbitrary JavaScript, shell, imports, callbacks, XPath, arbitrary CSS selectors, or executable
  regex in contracts.
- AI self-healing or automatic contract approval.
- HTTP-service or command-process behavior contracts. StillWorks' own `init`, `record`, `check`, and
  `diff` CLI remains in scope.
- A hosted dashboard, IDE extension, or MCP integration.
- A security sandbox, hostile-candidate isolation, or defense against an app deliberately detecting
  or attacking browser automation.
- Protecting credentials deliberately exposed to candidate code, or guaranteeing arbitrary app/user
  content and evidence are secret-free.
- Protection from malicious maintainers/admins, compromised trusted dependencies/platforms, browser
  zero-days, or runner escapes.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the guarantees StillWorks does and does not
make.
