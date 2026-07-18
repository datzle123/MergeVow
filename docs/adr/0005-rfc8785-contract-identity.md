# ADR-0005: RFC 8785 Contract Identity

Status: Accepted<br>
Date: 2026-07-19

## Context

Whitespace and object-property order can differ while a JSON contract means the same thing. Review,
diff, PR provenance, and future approval records need one reproducible content identity across
Windows, macOS, and Linux.

## Decision

MergeVow validates Contract V1 before identity work, then:

1. Serializes it with the JSON Canonicalization Scheme from
   [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785).
2. Encodes the canonical JSON as UTF-8.
3. Hashes those bytes with SHA-256.
4. Represents the identity as `sha256:<64 lowercase hexadecimal characters>`.

The implementation uses the exact-pinned `canonicalize` package and golden vectors. Duplicate keys,
non-JSON values, invalid Unicode, unknown fields, and schema-invalid contracts fail before
canonicalization.

MergeVow never canonicalizes a caller-owned live object. Validation first screens the input,
creates a detached snapshot that rejects dynamic `Proxy` values, masks inherited serialization
hooks, removes object prototypes while evaluating the own-property-only schema, and validates that
exact snapshot. Canonicalization masks serialization hooks again, emits RFC 8785 JSON, and validates
the exact emitted bytes. The returned contract is the deeply frozen parsed form of those bytes, so
it cannot diverge from its identity through caller mutation.

Unicode strings are preserved byte-for-byte after JSON decoding. MergeVow does not silently apply
Unicode normalization, so canonically equivalent but code-point-distinct strings have different
identities.

## Consequences

- Formatting and object-property order do not change a contract identity.
- Array order and every behavior-bearing value remain identity inputs.
- The contract version is inside the canonical document and therefore inside the hash.
- A future algorithm change requires an explicit algorithm label, migration, and new ADR.
- Cross-platform CI and a fixed golden hash guard against runtime/library drift.

## Guarantee Impact

A canonical hash identifies content; it does not prove authorship, approval, base selection, or
enforcement. Protected Attestation must bind this identity with all other fields listed in
[`../THREAT_MODEL.md`](../THREAT_MODEL.md).
