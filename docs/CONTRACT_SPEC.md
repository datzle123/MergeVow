# Contract Specification V1

Status: Locked for implementation by `SW-002`<br>
Schema ID: `https://stillworks.dev/schema/contract-v1.schema.json`

This document defines StillWorks' first data-only browser contract. The JSON Schema in
[`packages/contract/schema/contract-v1.schema.json`](../packages/contract/schema/contract-v1.schema.json)
is the machine-readable authority. This specification defines the wire format and the resource
rules that surround parsing it.

## Scope And Trust

A contract describes one loginless, same-origin Chromium flow. It contains no program, selector
language, timing policy, network policy, or evidence policy. The interpreter owns those behaviors.

The format is identical in both V0 trust levels. Local Cooperative mode reads the current workspace
contract. A configured PR Drift Gate reads the accepted contract, config, and schema from one exact
base SHA. Schema validation does not prove human approval, isolate malicious candidate code, or make
a workflow non-bypassable. The guarantees remain those in
[`THREAT_MODEL.md`](THREAT_MODEL.md).

## Document Shape

```json
{
  "version": 1,
  "flow": "checkout",
  "steps": [
    { "visit": "/checkout" },
    { "fill": { "locator": { "label": "Email" }, "value": "dev@example.test" } },
    { "click": { "role": "button", "name": "Place order" } },
    { "assertUrl": "/checkout/success" },
    { "assertVisible": { "role": "heading", "name": "Order confirmed" } },
    { "reload": {} },
    { "assertVisible": { "testId": "order-confirmation" } }
  ]
}
```

- `version` is exactly `1`.
- `flow` is a non-empty human-readable identifier.
- `steps` contains 1-100 ordered operations.
- Every step object has exactly one opcode key. A step cannot combine an action and assertion.
- Every object is closed. Missing fields and unknown fields fail validation.

## Locators

Exactly one locator strategy is allowed per locator:

| Strategy | Shape | Meaning |
|---|---|---|
| Role and accessible name | `{ "role": "button", "name": "Save" }` | Resolve one element by semantic role and accessible name |
| Label | `{ "label": "Email" }` | Resolve one control from its associated label |
| Test ID | `{ "testId": "order-total" }` | Resolve one element from the configured test-ID attribute |

Role locators require both fields, and `role` must be one of the roles supported by the pinned V0
Playwright release. Combining strategies or omitting a required field is invalid. Every
locator-bearing operation must resolve exactly one element except `assertCount`, which counts all
matches. `assertHidden` means one attached element is hidden; absence is expressed as an
`assertCount` expectation of zero. Missing and ambiguous locator behavior is implemented in
`SW-004`; V0 never silently heals a locator.

Role resolution excludes hidden accessibility targets by default. The trusted interpreter enables
Playwright's `includeHidden` behavior only while evaluating `assertHidden`; it is interpreter policy,
not a contract field.

Accessible names and labels use Playwright's exact semantics: case-sensitive, whole-string matching
after browser/Playwright whitespace normalization. Test IDs are literal exact strings. The
interpreter must not turn any strategy into a substring or regular-expression match.

XPath, CSS selectors, regular expressions, JavaScript, and custom resolver names are not contract
fields and are rejected as unknown data.

## Actions

| Opcode | Payload | Meaning |
|---|---|---|
| `visit` | Same-origin path string | Navigate from the configured application origin |
| `click` | Locator | Click the uniquely resolved element |
| `fill` | `{ "locator": Locator, "value": string }` | Replace the control value with the exact string |
| `select` | `{ "locator": Locator, "value": string }` | Select one option by its exact value |
| `check` | Locator | Put a checkbox or radio control into its checked state |
| `reload` | `{}` | Reload the current page |

`visit` accepts only an origin-relative path beginning with exactly one `/`. Absolute URLs,
protocol-relative URLs, backslashes, ASCII control characters, and DEL are invalid. Redirect and
subresource enforcement is a runtime responsibility of the same-origin guard in `SW-006`; schema
validation alone is not a network sandbox.

## Assertions

| Opcode | Payload | Expected condition |
|---|---|---|
| `assertVisible` | Locator | The uniquely resolved element is visible |
| `assertHidden` | Locator | The uniquely resolved element is hidden |
| `assertUrl` | Same-origin path string | `pathname + search + hash` equals the supplied path |
| `assertText` | `{ "locator": Locator, "equals": string }` | Rendered text equals the supplied string |
| `assertValue` | `{ "locator": Locator, "equals": string }` | Control value equals the supplied string |
| `assertCount` | `{ "locator": Locator, "equals": integer }` | The locator resolves to exactly that many elements |
| `assertChecked` | `{ "locator": Locator, "equals": boolean }` | Checked state equals the supplied boolean |
| `assertDisabled` | `{ "locator": Locator, "equals": boolean }` | Disabled state equals the supplied boolean |

Text and value assertions are literal, never regular-expression matches. Text equality uses the
deterministic whitespace normalization defined with the interpreter in `SW-005`; value equality uses
the exact raw control value. `assertCount.equals` is a non-negative safe integer.

## Resource Limits

| Resource | Limit | Measurement |
|---|---:|---|
| Raw document | 65,536 bytes | UTF-8 bytes before parsing; whitespace counts |
| JSON depth | 8 | Root is depth 1; each array or object member value increases depth by 1 |
| JSON nodes | 2,048 | Root, every array/object value, and every primitive value count; property names do not |
| Steps | 1-100 | Array entries |
| Flow | 64 characters | JSON Schema string length |
| URL/path | 2,048 characters | JSON Schema string length |
| Locator text | 512 characters per field | JSON Schema string length |
| Input/expected value | 4,096 characters per field | JSON Schema string length |

The parser checks raw size and valid Unicode first. A strict source scan rejects malformed JSON,
comments, trailing commas, and duplicate object keys, including equivalent escaped key spellings,
before `JSON.parse` can discard information. It then bounds depth and node count before schema
validation. A violation fails closed and returns no partial contract. These limits are exported from
[`limits.ts`](../packages/contract/src/limits.ts); the numeric values in the JSON Schema must remain
identical.

## Canonical Identity

After validation, StillWorks serializes the contract with RFC 8785 JSON Canonicalization Scheme and
hashes the UTF-8 canonical JSON with SHA-256. The public identity format is
`sha256:<64 lowercase hexadecimal characters>`.

Whitespace and object-property order do not affect identity. Array order and values do. Unicode is
not normalized: code-point-distinct strings remain distinct. Invalid input returns structured
validation issues and never produces a partial canonical document or hash.
Programmatic validation returns a detached inert snapshot rather than a caller-owned live object.
Canonicalization uses that snapshot, and the contract returned with an identity is the deeply frozen
parsed form of the exact hashed bytes.
[ADR-0005](adr/0005-rfc8785-contract-identity.md) records the durable decision and its trust-boundary
limits.

## Deliberately Absent

V1 has no timeout, retry, sleep, wait, callback, import, shell, JavaScript, regex, XPath, CSS,
arbitrary navigation, cookie, header, storage-state, multi-tab, frame, or evidence-capture field.
Unknown operation names and unknown nested fields fail validation.

Timeout and cancellation budgets belong to trusted interpreter configuration, not candidate-editable
contract data. Evidence explains a verdict but never becomes an assertion oracle.

## Interpreter Policy

The fixed interpreter dispatches validated steps in source order and stops at the first semantic or
infrastructure failure. Trusted defaults are 10 seconds per step and 120 seconds total; code-owned
bounds allow 1-60,000 ms per step and 1-600,000 ms total. Contract data cannot alter these values.

`runContract()` emits `PASS`, `REGRESSION`, or `INFRA_ERROR` with a zero-based failing step index and
the exact frozen step. It performs no retry and cannot emit `FLAKY`. Diagnostic reruns and flaky
classification require a separate future layer. See
[ADR-0006](adr/0006-deterministic-interpreter-boundary.md).
