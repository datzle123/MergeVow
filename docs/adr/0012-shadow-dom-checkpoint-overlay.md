# ADR-0012: Shadow DOM Checkpoint Overlay

Status: Accepted<br>
Date: 2026-07-19

## Context

SW-008 records the approved action subset, but MergeVow's product value comes from outcomes selected
by a human. Requiring JSON edits for assertions would leave the primary authoring path incomplete.
The checkpoint surface must express all Contract V1 assertions without adding selectors, scripts,
callbacks, or generated healing data to the contract.

## Decision

1. `@mergevow/recorder` accepts an opt-in `checkpointOverlay: true` option. Action-only callers keep
   their existing behavior and no overlay DOM is created by default.
2. Every recorder document mounts one fixed tool surface in an open Shadow DOM. The init script
   reinjects it after same-origin document navigation, and recorder cleanup removes it. Overlay DOM
   is excluded from event-time semantic scans and recorder action events.
3. The overlay supports exactly `assertVisible`, `assertHidden`, `assertUrl`, `assertText`,
   `assertValue`, `assertCount`, `assertChecked`, and `assertDisabled`. It cannot create a new opcode
   or executable field.
4. Visible targets use one explicit pointer-picking gesture. The overlay draws an owned highlight,
   consumes that gesture before application handlers, and never writes style or metadata to the
   selected element. The full panel collapses to a compact cancel surface during picking so covered
   page targets remain available. Keyboard activation uses a bounded semantic target list. Native
   disabled controls are selected at pointer-down before click activation.
5. Hidden targets come from a bounded semantic list because they cannot be clicked. Hidden role
   candidates use the interpreter's existing `includeHidden` policy. The list shares one DOM snapshot
   and one semantic-work budget and fails closed instead of returning a partial list.
6. The user chooses among eligible exact role/name, label, and test-ID candidates. Assertions other
   than count require an event-time match count of one. Count intentionally permits a non-unique
   approved locator and records its bounded observed count. Confirmation re-captures the selected
   target and rejects missing, newly ambiguous, changed-state, or changed-count selections.
7. Text uses Contract V1 rendered-text whitespace normalization, value remains exact, checked and
   disabled use the same native and ARIA semantics as replay, and URL records the exact same-origin
   pathname, search, and hash. A URL change before confirmation invalidates that selection.
8. Confirmed assertion events use the same bounded browser binding and serialized Node queue as
   actions. Pending fill is flushed first, preserving source order. Cancel and invalid selection emit
   nothing; malformed events or resource violations return one bounded failure and no contract.
9. The final contract still passes the closed Contract V1 validator and is detached and deeply
   frozen. The overlay does not write files, storage, screenshots, traces, or report evidence.

## Consequences

- SW-013 can expose one complete action-and-checkpoint recording flow without inventing another
  assertion format.
- The UI is intentionally compact and operational rather than a page builder. It owns one temporary
  picking gesture; outside picker mode it does not intercept application input.
- Overlay controls stop composed events before they bubble out of the Shadow DOM. Capture-phase page
  listeners can still observe or interfere with the in-page surface, which remains part of the Local
  Cooperative boundary rather than an event-isolation guarantee.
- Page-derived URL, semantic names, rendered text, values, and test IDs can contain sensitive data.
  Configured redaction remains owned by SW-010.
- The overlay runs inside the cooperative application page. Open Shadow DOM isolates ordinary style
  and DOM scope, not hostile capture listeners; it is not a security boundary and cannot prove a
  human made a selection.

## Guarantee Impact

This completes Local Cooperative Contract V1 authoring inside the unreleased workspace package. It
adds no artifact ownership, approval, exact-base selection, PR enforcement, tamper resistance,
hostile-page isolation, or Protected Attestation guarantee.
