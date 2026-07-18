# ADR-0004: Three-Level Trust Model

Status: Accepted<br>
Date: 2026-07-18

## Context

An accepted contract at a base SHA can describe oracle selection without proving explicit human
approval, workflow enforcement, or candidate isolation. Treating these as one guarantee would
overstate V0 security.

## Decision

MergeVow exposes three distinct levels:

1. **Local Cooperative:** the current user chooses both app and local contract; no approval or
   tamper-resistance claim is made.
2. **PR Drift Gate:** if a configured check executes as specified, it selects the governed bundle
   from one exact base SHA and runner semantics from an immutable release digest. This protects
   artifact selection for that invocation, not the runner from hostile candidate code.
3. **Protected Attestation:** the check and approval store are outside candidate control, candidate
   execution is isolated, and approval binds every repository, commit, bundle, runner, policy, and
   approver input defined by the threat model.

Replay uses `executionVerdict`; governed head changes use a separate `proposalStatus`. Every governed
add, edit, delete, rename, symlink, or config change requires approval regardless of replay outcome.
V0 cannot produce `APPROVED` or activate a proposal.

The canonical preconditions, guarantees, controls, and exclusions live in
[`../THREAT_MODEL.md`](../THREAT_MODEL.md).

## Consequences

- UI and reports must name the active trust level.
- Documentation cannot use the strongest tagline without qualification outside Protected
  Attestation.
- PR Drift Gate tests prove oracle selection and independent proposal reporting, not human approval,
  unbypassable enforcement, or hostile-code isolation.
- Protected Attestation remains unavailable until external enforcement, isolated execution, fully
  bound approval, and executable acceptance tests exist.
