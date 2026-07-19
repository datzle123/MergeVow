# ADR-0011: Guarded Semantic Action Recorder

Status: Accepted<br>
Date: 2026-07-19

## Context

The handwritten persistence contract proved replay value but required JSON authoring. MergeVow needs
an action-capture kernel before checkpoint UI or CLI work, without allowing browser events to become
selectors, scripts, or other executable contract data.

## Decision

1. `@mergevow/recorder` accepts a caller-owned pinned Chromium browser, one normalized loopback
   origin, a Contract V1 flow, and one same-origin start path. It owns a fresh guarded context and
   returns either one complete validated contract or one bounded failure; startup uses a typed
   bounded error and partial steps never escape.
2. A context init script observes the six approved actions: initial/direct `visit`, `click`, `fill`,
   `select`, `check`, and `reload`. Fill batching is bounded; consecutive fills for the same
   document/element marker retain the first locator and replace only its final bounded value.
3. A browser IIFE bundles `dom-accessibility-api` with the recorder. At the DOM event it computes one
   standards-based accessible name/role plus eligible label and exact test-ID candidates. Match
   counting has explicit DOM and semantic-work budgets. Node performs a 250 ms opportunistic exact
   Playwright recheck; a bounded event-time proof survives navigation, target removal, or replacement.
4. Native links, areas, and submit controls emit a short-lived causal intent. Node grants navigation
   ownership only when that intent matches a main-frame Playwright request and commit, including
   redirects. Prevented clicks, downloads, 204 responses, validation-blocked submits, and later
   navigation cannot inherit stale ownership. Unowned implicit/programmatic form submission fails
   closed; other direct navigation becomes `visit`, while `reload` remains explicit.
5. A randomized temporary data attribute binds Playwright validation to the acted-on element. It is
   restored on shutdown and never enters a contract. CSS, XPath, regex, callbacks, source snippets,
   and Playwright handles are not persisted.
   Clicks without native action semantics, an explicit role, test ID, or inline action marker are
   treated as non-actions; a custom control must expose role semantics or a test ID to be recordable.
6. Password controls fail before their value is read. File input, uncheck, multi-value select,
   unsupported input types, browser dialogs, frames, invalid/ambiguous locators, resource-limit
   violations, guarded network failure, and any auxiliary page invalidate the whole recording.
7. Current and historical page targets are checked with the SW-007A Chromium protocol barrier.
   Guarded policy and transport evidence takes precedence over page-event or locator errors.
8. Browser event promises are capped at 128 and fill work is batched before Node's serialized queue;
   exceeding the cap invalidates the recording instead of allowing unbounded pending input.
9. The returned contract has no fields for cookies, authorization headers, raw request/response
   bodies, local/session storage, or Playwright storage state. The guarded driver necessarily relays
   same-origin headers and bodies. Tests prove fresh contexts do not reuse browser state. Arbitrary
   URL, label, and page text can still contain secrets; configured content redaction belongs to
   SW-010.

## Consequences

- SW-009 can add assertion selection without changing action-capture or contract boundaries.
- SW-013 can launch a headed browser and persist the returned contract; this package itself writes no
  files and does not manage application processes.
- Browser instrumentation is cooperative authoring machinery, not hostile-page isolation or proof
  that a page cannot forge events. Every result still passes the closed Contract V1 validator.
- The standards-based accessible-name dependency is bundled into the published browser artifact and
  cross-checked against Playwright with navigation, mutation, shadow-root, and ambiguity cases.
- Only pinned Chromium is supported. Additional pages, frames, production sessions, and auth remain
  outside V0 recording.

## Guarantee Impact

This makes Local Cooperative action authoring available as an unreleased workspace API. It adds no
artifact ownership, approval, exact-base selection, PR enforcement, tamper resistance, hostile-code
isolation, or Protected Attestation guarantee.
