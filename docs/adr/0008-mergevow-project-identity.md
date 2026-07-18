# ADR-0008: MergeVow Project Identity

Status: Accepted<br>
Date: 2026-07-19

## Context

The original `StillWorks` working name collided with an existing verified GitHub organization, an
unrelated API product using `stillworks.dev`, and an npm scope not controlled by this repository
owner. Keeping it would make installation, search, and package provenance needlessly ambiguous.

Before selection, `MergeVow` had no observed exact-name npm package/scope, GitHub repository or
user/organization, or material product result in web search. RDAP and DNS checks found no registered
or resolving `mergevow.com`, `.dev`, or `.io` at the time of review. These checks are an availability
snapshot, not legal clearance or reservation.

## Decision

1. The product and repository name are **MergeVow**.
2. The canonical repository is `datzle123/MergeVow`.
3. Workspace packages use the prospective `@mergevow/*` namespace; the future unscoped CLI package
   and executable are `mergevow`.
4. Repository-local runtime state uses `.mergevow/`.
5. The JSON Schema identifier uses the canonical GitHub document URL until a project-controlled
   domain exists.
6. The Codex project skill is `build-mergevow`.

## Consequences

- Existing GitHub links redirect after the repository rename, but maintained docs use the canonical
  URL.
- No document may say the npm scope, package, handle, trademark, or domain is owned until it is
  actually reserved and verified.
- npm authentication, Trusted Publishing, provenance, and the first public version remain owned by
  `SW-020`.
- A later domain change may update documentation and the schema identifier through a versioned ADR;
  it must not change validated contract semantics or canonical contract hashes.

## Guarantee Impact

None. This is a project and package identity decision. Local Cooperative, PR Drift Gate, and
Protected Attestation guarantees remain exactly as defined in the threat model.
