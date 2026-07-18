# @mergevow/interpreter

Workspace-only deterministic Contract V1 state machine for MergeVow.

## Boundary

- Validates and freezes Contract V1 before execution.
- Dispatches the fixed opcode set through explicit typed driver methods.
- Stops at the first semantic regression or infrastructure failure.
- Applies trusted per-step, total-timeout, and cancellation policy.
- Produces deterministic typed result data without timestamps, durations, retry, or hidden reruns.

The interpreter does not implement Playwright actions, network policy, evidence capture, base-oracle
selection, proposal approval, or isolation. `FLAKY` is part of the project result vocabulary but can
only be produced by a future explicit diagnostic rerun layer; `runContract()` never emits it.
Driver messages and observed values remain bounded untrusted data; future renderers must escape them.
