# @stillworks/playwright-driver

Workspace-only pinned Playwright primitives for StillWorks browser replay.

## Working Today

- Exact role plus accessible-name, label, and test-ID queries.
- Structured `LOCATOR_MISSING` and `LOCATOR_AMBIGUOUS` results for unique resolution.
- Separate match observation for future `assertCount` execution.
- Trusted `includeHidden` policy support for future `assertHidden` execution.
- Real Chromium coverage for semantic DOM refactors and failure behavior.

The resolver observes the current DOM once. `SW-005` owns wait, timeout, cancellation, and replay
state; `SW-006` owns navigation and network policy. This package does not provide isolation, oracle
selection, or approval.
