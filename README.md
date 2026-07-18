# MergeVow

**Show it once. Keep it working.**

[![Repository CI](https://github.com/datzle123/MergeVow/actions/workflows/ci.yml/badge.svg)](https://github.com/datzle123/MergeVow/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-2ea44f.svg)](LICENSE)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](tsconfig.base.json)

MergeVow is being built as an open-source tool for human-owned behavior contracts in CI. The V0
goal is simple: demonstrate a critical browser flow, select the semantic outcomes that matter, and
check candidate code with a selected local contract or a base-selected PR oracle.

> Your agent can edit the code, not silently redefine done.

That unqualified claim is the post-V0 target for Protected Attestation. V0 has a narrower promise:
when the configured PR Drift Gate executes as specified, head contract/config edits cannot replace
the base-selected oracle for that invocation. It is an artifact-selection guarantee, not hostile-code
isolation or proof of human approval. See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Project Status

**The contract kernel, semantic locator resolver, deterministic interpreter, and loopback
same-origin browser guard are complete. Browser action replay has not shipped.**

The repository contains the product charter, threat model, execution plan, validation kit, demo
specifications, development toolchain, Codex skill, and three tested product packages:
`@mergevow/contract`, `@mergevow/playwright-driver`, and `@mergevow/interpreter`.

Those are prospective workspace package identities. The `@mergevow` npm scope and `mergevow` CLI
package are not reserved or published yet.

## Working Today

The contract kernel already provides:

- A closed JSON Schema 2020-12 wire format with semantic locators and no executable fields.
- Fail-closed UTF-8/JSON parsing with byte, depth, node, string, and step limits.
- Rejection of duplicate keys, dangerous prototype keys, external URL operands, and unknown fields.
- RFC 8785 canonical JSON plus stable `sha256:<hex>` contract identities.
- Exact Playwright role/name, label, and test-ID matching with structured missing/ambiguous results.
- Fixed source-order opcode dispatch with typed regression, timeout, cancellation, and driver errors.
- Cookie-isolated loopback contexts that inspect redirects, bypass caller launch proxies, separate
  transport failures, and reject cross-origin requests plus unsupported realtime/worker APIs.
- Golden and boundary tests on Linux, Windows, and macOS through repository CI.

Workspace API today (the package is not published to npm yet):

```ts
import { hashContract, parseContract } from "@mergevow/contract";

const parsed = parseContract(`{
  "version": 1,
  "flow": "checkout",
  "steps": [
    { "visit": "/checkout" },
    { "assertVisible": { "role": "heading", "name": "Checkout" } }
  ]
}`);

if (!parsed.ok) throw new Error(parsed.issues[0]?.message);

const identity = hashContract(parsed.value);
if (!identity.ok) throw new Error(identity.issues[0]?.message);

console.log(identity.value.hash);
```

Browser replay, recording, evidence, and the PR Drift Gate remain on the public
[issue roadmap](docs/BACKLOG.md); they are not advertised as shipped.

## For Contributors

1. Read [PROJECT_PLAN.md](PROJECT_PLAN.md).
2. Check [READY_TO_START.md](READY_TO_START.md).
3. Read [AGENTS.md](AGENTS.md) before using a coding agent.
4. Review [docs/BACKLOG.md](docs/BACKLOG.md).
5. Continue with `SW-007` and prove the Week 2 vertical slice before the recorder.

## Setup

```bash
corepack enable
pnpm install
pnpm browser:install
pnpm check
```

Node.js 24+ and pnpm 11 are the prepared baseline.

## V0 Boundary

V0 uses TypeScript, pinned Chromium, deterministic loginless web flows, data-only contracts, and
semantic locators. Screenshots and traces are sensitive evidence, not the oracle.

<details>
<summary>What V0 explicitly does not include</summary>

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

</details>

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the guarantees MergeVow does and does not
make.
