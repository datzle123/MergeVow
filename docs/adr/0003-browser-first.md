# ADR-0003: Browser First

Status: Accepted<br>
Date: 2026-07-18

## Decision

Launch with deterministic, loginless Chromium flows. Keep the internal contract model adaptable but
do not ship behavior-contract adapters for HTTP services or command processes in V0. MergeVow's own
command-line client remains in scope.

## Why

Browser flows provide the clearest human demonstration and acquisition loop. Launching multiple
boundaries would combine browser flakiness, protocol normalization, side-effect isolation, secrets,
and dependency virtualization before proving demand.

## Expansion Gate

Add another boundary only after 10 weekly-active browser repositories and three organic requests for
the same adapter.

## Guarantee Impact

Browser-first is a product boundary, not a security sandbox claim. Candidate browser behavior and
evidence remain untrusted at every level. V0 filters browser traffic but does not control all
candidate-process egress; secretless isolated execution is a Protected Attestation requirement. The
canonical controls are in [`../THREAT_MODEL.md`](../THREAT_MODEL.md).
