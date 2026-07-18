# ADR-0010: Local Cooperative Playwright Replay

Status: Accepted<br>
Date: 2026-07-19

## Context

Contract parsing, semantic locators, deterministic interpretation, and the guarded browser context
were implemented separately. MergeVow needed one end-to-end Local Cooperative proof before recorder,
evidence, CLI, or PR-gate work could begin.

## Decision

1. `@mergevow/playwright-driver` implements all 14 Contract V1 driver methods against one page in a
   guarded Chromium context. Locator absence, ambiguity, and observed assertion mismatch are
   deterministic semantic failures; Playwright exceptions are infrastructure failures.
2. The driver checks the guard's retained first policy violation and first transport failure before
   and after every operation. A retained condition throws a bounded infrastructure error, so the
   interpreter emits `INFRA_ERROR` rather than misreporting app behavior as `REGRESSION`. Chromium's
   exact internal `chrome-error://chromewebdata/` failure document is ignored only for frame-origin
   observation so it cannot hide the retained guarded-transport failure.
3. Replay requires exactly one controlled page. Once a popup or additional page is observed, the
   driver retains the maximum observed page count and fails closed even if the page immediately
   closes. A bounded 50 ms post-operation observation window precedes the final check so immediately
   queued Playwright events can be retained.
4. On step cancellation, the driver closes its controlled page. The interpreter remains the owner of
   cancellation, per-step timeout, and total-timeout classification.
5. Application readiness probes only the normalized trusted loopback origin with a direct Node HTTP
   or HTTPS `HEAD /` request. Any HTTP status means the listener is ready; the probe never follows a
   redirect. Connection errors retry within trusted per-attempt, interval, and total bounds, and an
   external abort cancels the active request.
6. `assertText` reads rendered `innerText`. Both observed and expected strings collapse each
   ECMAScript whitespace run to one ASCII space and trim leading/trailing whitespace before literal,
   case-sensitive comparison. It performs no Unicode normalization.
7. Assertion values are compared in full, while returned issue codes, messages, and observed strings
   are bounded before the interpreter accepts them.
8. The todo proof uses one seven-step data-only contract. Baseline and semantic-refactor variants
   persist through browser local storage and pass. The broken variant updates only in-memory UI state
   and returns `REGRESSION` with `LOCATOR_MISSING` at zero-based step 6 after reload.
9. Every variant receives a fresh context. The harness never exports or reuses cookies, local
   storage, or `storageState`.
10. The demo's terminal summary quotes every dynamic value as JSON and contains no timestamp or
   measured duration.

## Consequences

- Local Cooperative replay is implemented end to end in the workspace and demo, but remains
  unreleased and has no recorder or CLI acquisition path.
- An HTTP 404 or 500 is listener readiness, not an infrastructure verdict; later contract steps
  determine whether the application behavior is acceptable.
- The post-operation observation window is cooperative and bounded. A later retained event fails the
  next operation, but arbitrarily delayed effects beginning after the final window are outside this
  V0 replay guarantee.
- Closing the page is safe because the interpreter stops after cancellation or timeout; a later
  operation cannot reuse that page.
- Evidence capture, retries, `FLAKY`, report packages, exact-base loading, proposal status, and GitHub
  enforcement remain in their owning issues.

## Guarantee Impact

This implements the narrow Local Cooperative replay path. The local user still selects the app,
contract, and runner. It adds no ownership, approval, tamper resistance, CI enforcement,
hostile-code isolation, PR Drift Gate, or Protected Attestation guarantee.
