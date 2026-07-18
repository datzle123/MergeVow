# @mergevow/playwright-driver

Workspace-only pinned Playwright primitives for MergeVow browser replay.

## Working Today

- Exact role plus accessible-name, label, and test-ID queries.
- Structured `LOCATOR_MISSING` and `LOCATOR_AMBIGUOUS` results for unique resolution.
- Separate match observation for future `assertCount` execution.
- Trusted `includeHidden` policy support for future `assertHidden` execution.
- Real Chromium coverage for semantic DOM refactors and failure behavior.
- Guarded contexts for one exact HTTP(S) loopback origin with Service Workers disabled.
- Cookie-isolated direct request preflight that preserves browser credentials semantics and cannot
  inherit a caller's launch proxy.
- An owned loopback deny proxy plus rejection of WebSocket, EventSource, WebTransport, WebRTC, and
  dedicated/shared worker APIs outside the V0 profile.
- Frozen, bounded first-policy-violation and first-transport-failure data for the future driver.
- Idempotent owned closure that drains active transports without unhandled route failures.

The resolver observes the current DOM once. `SW-005` owns wait, timeout, cancellation, and replay
state; `SW-007` will connect these primitives to real browser operations and app readiness. Routing
buffers allowed responses through Playwright and disables HTTP cache. Unsupported API constructor
replacement is compatibility policy, not a hostile-code boundary. This package does not claim
complete browser, process, dependency-install, DNS, or operating-system egress control and does not
provide isolation, oracle selection, or approval.
