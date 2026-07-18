# Packages

`contract` is implemented through `SW-003`: JSON Schema v1, strict TypeScript types, bounded parsing,
fail-closed validation, RFC 8785 serialization, and SHA-256 identity. Create the remaining package
manifests only when their owning issue starts.

- `contract`: schema, validation, and canonical identity implemented; semantic diff follows in
  `SW-012`.
- `interpreter`: deterministic step state machine.
- `playwright-driver`: Chromium adapter, network guards, evidence capture.
- `recorder`: headed action recorder and checkpoint overlay.
- `reporter`: HTML, JSON, and Markdown evidence.
- `cli`: `init`, `record`, `check`, and `diff`.
