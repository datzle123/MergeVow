# Packages

`contract` is implemented through `SW-003`, and `playwright-driver` now owns the `SW-004` semantic
locator resolver. Create the remaining package manifests only when their owning issue starts.

- `contract`: schema, validation, and canonical identity implemented; semantic diff follows in
  `SW-012`.
- `interpreter`: deterministic step state machine.
- `playwright-driver`: exact role/name, label, and test-ID resolution implemented; Chromium lifecycle,
  network guards, and evidence capture follow in their owning issues.
- `recorder`: headed action recorder and checkpoint overlay.
- `reporter`: HTML, JSON, and Markdown evidence.
- `cli`: `init`, `record`, `check`, and `diff`.
