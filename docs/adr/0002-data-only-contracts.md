# ADR-0002: Contracts Are Data Only

Status: Accepted<br>
Date: 2026-07-18

## Decision

MergeVow contracts use a versioned JSON schema and a fixed interpreter. They cannot contain
JavaScript, shell, imports, callbacks, XPath, arbitrary CSS selectors, or executable regex.

Unknown and duplicate fields fail validation. Contracts have explicit byte, depth, node, string,
step-count, and URL-operand limits. Schema v1 exposes no timeout field; bounded replay timeouts are
fixed interpreter policy owned by `SW-005`.

## Why

The product promise requires selected behavior to be reviewable, portable, and separable from
candidate implementation code. An executable test file would recreate the goalpost problem and
enlarge the security surface. Base selection is not proof of human approval; that claim is reserved
for Protected Attestation.

## Consequences

The initial opcode set will be intentionally small. New opcodes require schema fixtures, interpreter
tests, threat-model review, and a migration story.

## Guarantee Impact

Data-only contracts reduce the oracle's executable surface and make changes reviewable. They do not
make candidate code safe, establish who owns the active oracle, or prevent a check from being
bypassed. Ownership, isolation, and enforcement remain separate trust-level requirements in
[`../THREAT_MODEL.md`](../THREAT_MODEL.md).
