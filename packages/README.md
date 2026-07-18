# Packages

`contract` is implemented through `SW-002`: JSON Schema v1, strict TypeScript types, bounded parsing,
and fail-closed validation. Create the remaining package manifests only when their owning issue
starts.

- `contract`: schema and validation implemented; canonicalization and semantic diff follow in
  `SW-003` and `SW-012`.
- `interpreter`: deterministic step state machine.
- `playwright-driver`: Chromium adapter, network guards, evidence capture.
- `recorder`: headed action recorder and checkpoint overlay.
- `reporter`: HTML, JSON, and Markdown evidence.
- `cli`: `init`, `record`, `check`, and `diff`.
