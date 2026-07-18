# Packages

`contract` is implemented through `SW-003`, `playwright-driver` owns the `SW-004` semantic locator
resolver, and `interpreter` owns the `SW-005` deterministic state machine. Create remaining package
manifests only when their owning issue starts.

- `contract`: schema, validation, and canonical identity implemented; semantic diff follows in
  `SW-012`.
- `interpreter`: source-order opcode dispatch, timeout, cancellation, and typed results implemented.
- `playwright-driver`: exact role/name, label, and test-ID resolution plus the cookie-isolated
  loopback request/API guard implemented; Chromium action replay and evidence capture follow in
  their owning issues.
- `recorder`: headed action recorder and checkpoint overlay.
- `reporter`: HTML, JSON, and Markdown evidence.
- `cli`: `init`, `record`, `check`, and `diff`.
