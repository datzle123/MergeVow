# ADR-0006: Deterministic Interpreter Boundary

Status: Accepted<br>
Date: 2026-07-19

## Context

Contract V1 needs one fixed execution path that cannot be extended by contract data. Browser timing,
cancellation, semantic mismatch, and infrastructure failure must remain distinguishable without
turning retries into pass.

## Decision

The interpreter:

1. Validates and freezes Contract V1 before driver execution.
2. Dispatches each approved opcode through an explicit typed driver method in source order.
3. Stops on the first semantic failure, driver failure, cancellation, or timeout.
4. Uses trusted policy defaults of 10 seconds per step and 120 seconds total, bounded in code. Timing
   policy is not a contract field.
5. Returns deterministic data with the zero-based failing step index and exact frozen step, without
   timestamps or measured durations.
6. Emits `PASS`, `REGRESSION`, or `INFRA_ERROR`. It performs no retry and cannot emit `FLAKY`.

The driver receives an `AbortSignal` and must cooperate with cancellation. The interpreter also races
the driver promise against its deadlines so an uncooperative call cannot block the returned result;
same-process code is not treated as isolated and may continue side effects if it ignores the signal.

## Result Classification

- A driver-reported semantic mismatch is `REGRESSION`.
- Invalid contract or policy, cancellation, timeout, driver exception, and malformed driver protocol
  are `INFRA_ERROR` with distinct codes.
- A later diagnostic rerun layer may classify inconsistent executions as `FLAKY`; it must never
  replace an initial failure with `PASS`.

## Consequences

- Contract data cannot select callbacks, implementation methods, retries, sleeps, or timeout values.
- Driver implementations remain replaceable without moving opcode semantics into the contract.
- Exact failure location is stable for reports and future evidence capture.
- Actual Playwright operations, same-origin enforcement, and persistence proof remain separate
  issues.

## Guarantee Impact

This is Local Cooperative replay infrastructure. It does not establish human approval, select an
exact-base oracle, isolate candidate code, or provide the PR Drift Gate.
