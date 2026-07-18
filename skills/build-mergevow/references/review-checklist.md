# Trust-Boundary Review Checklist

Use the sections relevant to the change.

## Contract And Parser

- Does the schema reject unknown properties?
- Are size, depth, string, URL, and timeout bounds explicit?
- Can any field execute code, shell, regex with unsafe complexity, or an unrestricted selector?
- Are canonical serialization and hashes stable across platforms?
- Do malformed and malicious fixtures fail closed?

## Interpreter And Browser

- Are state transitions deterministic and cancellable?
- Do timeouts identify the exact step?
- Are missing and ambiguous locators failures?
- Is external navigation/network blocked by default?
- Does retry classify flakiness without hiding a failure?

## Evidence

- Is every rendered field escaped?
- Are password capture and intentional cookie, authorization, or storage-state serialization
  blocked? Are configured redactors tested without claiming arbitrary evidence is secret-free?
- Is retention bounded?
- Is evidence clearly separated from the semantic pass/fail oracle?

## Git And CI

- Is the exact base SHA resolved once, recorded, and used for contract/config/schema with no fallback
  to head?
- Is the runner/action loaded from and recorded as an immutable release digest?
- Can any head add/edit/delete/rename/symlink/config change avoid
  `CHANGE_REQUIRES_APPROVAL`, including when replay passes?
- Are base and candidate workspaces separated for provenance without claiming process isolation?
- Does candidate code receive a token, secret, credential helper, privileged cache, or internal
  network access?
- Is `pull_request_target` avoided for candidate execution?
- For Protected Attestation, is approval bound to repository/PR, base SHA, accepted-bundle digest,
  head SHA, proposed-bundle digest, runner/action digest, policy/schema version, approver identity,
  and authorization?
- Does any change to a bound input invalidate approval?

## Scope And Product

- Is this work required by the active `SW-*` issue?
- Has the prerequisite product gate passed?
- Does the change preserve the V0 boundary and current ICP?
- Would Playwright codegen plus CODEOWNERS already solve it?
- Is the user-facing guarantee honest and testable?
