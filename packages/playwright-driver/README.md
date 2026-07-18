# @mergevow/playwright-driver

Workspace-only pinned Playwright primitives for MergeVow browser replay.

## Working Today

- Exact role plus accessible-name, label, and test-ID queries.
- Structured `LOCATOR_MISSING` and `LOCATOR_AMBIGUOUS` results for unique resolution.
- Separate match observation for `assertCount` execution.
- Trusted `includeHidden` policy support for `assertHidden` execution.
- Real Chromium coverage for semantic DOM refactors and failure behavior.
- Guarded contexts for one exact HTTP(S) loopback origin with Service Workers disabled.
- Cookie-isolated direct request preflight that preserves browser credentials semantics and cannot
  inherit a caller's launch proxy.
- An owned loopback deny proxy plus rejection of WebSocket, EventSource, WebTransport, WebRTC, and
  dedicated/shared worker APIs outside the V0 profile.
- Frozen, bounded first-policy-violation and first-transport-failure data checked around every
  driver operation.
- Idempotent owned closure that drains active transports without unhandled route failures.
- Bounded, cancellable, no-redirect readiness for one exact loopback origin.
- All 14 Contract V1 operations, deterministic mismatch values, normalized rendered text, and
  cooperative page closure on cancellation.
- Fail-closed single-page topology: any observed popup or additional page is an infrastructure
  error, even when it closes immediately.

Each operation has a bounded 50 ms post-operation window before its final guard and topology check.
This lets immediately queued Playwright events become retained evidence; it is a cooperative
observation window, not proof that arbitrarily delayed application effects cannot occur. A later
retained event fails the next operation, while activity beginning after the final window is outside
this V0 replay guarantee.

The resolver observes the current DOM once. `SW-005` owns timeout, cancellation, and replay state;
the driver cooperates without moving policy into contract data. Routing
buffers allowed responses through Playwright and disables HTTP cache. Unsupported API constructor
replacement is compatibility policy, not a hostile-code boundary. This package does not claim
complete browser, process, dependency-install, DNS, or operating-system egress control and does not
provide isolation, oracle selection, or approval.
