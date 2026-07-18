# Packages

`contract` is implemented through `SW-003`, `interpreter` owns the `SW-005` deterministic state
machine, and `playwright-driver` is implemented through the `SW-007` Local Cooperative replay
slice. Create remaining package manifests only when their owning issue starts.

- `contract`: schema, validation, and canonical identity implemented; semantic diff follows in
  `SW-012`.
- `interpreter`: source-order opcode dispatch, timeout, cancellation, and typed results implemented.
- `playwright-driver`: exact semantic resolution, cookie-isolated loopback request/API guard,
  readiness, all 14 Chromium operations, cancellation, and deterministic assertion mismatch data
  implemented; evidence capture follows in its owning issue.
- `recorder`: headed action recorder and checkpoint overlay.
- `reporter`: HTML, JSON, and Markdown evidence.
- `cli`: `init`, `record`, `check`, and `diff`.
