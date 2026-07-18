# ADR-0009: Repository Governance Baseline

Status: Accepted<br>
Date: 2026-07-19

## Context

MergeVow is a public repository with one maintainer. Before this decision, `main` had no branch rule,
all merge methods were enabled, merged branches remained open, Actions allowed any public action,
and the documented security-reporting route was public. CodeQL and Dependabot were not enabled.

Controls must reduce accidental or routine contributor drift without deadlocking a solo maintainer
or being marketed as MergeVow's future PR Drift Gate.

## Decision

1. Pull requests are squash-merged with the PR title, an empty generated message, and automatic
   source-branch deletion. Merge commits and rebases are disabled.
2. One active repository ruleset targets the default branch with no bypass actor. It requires a pull
   request, linear history, resolved review conversations, and strict Linux, macOS, and Windows CI
   checks from GitHub Actions. It blocks deletion and non-fast-forward updates.
3. Required approvals and required CODEOWNER approvals remain zero while there is one maintainer. A
   second active maintainer is the gate for raising either value.
4. GitHub Actions accepts GitHub-owned actions only and requires every `uses:` reference to use a
   full commit SHA. The default token is read-only and cannot approve pull requests. Every external
   contributor requires workflow approval. Artifact and log retention is 14 days.
5. Secret scanning, push protection, private vulnerability reporting, Dependabot alerts and security
   updates, and CodeQL default setup are enabled. After a successful baseline scan, the default-branch
   ruleset requires CodeQL results with `errors` and `high_or_higher` thresholds.
6. `CODEOWNERS`, private security guidance, a Code of Conduct, issue routing, the PR template, and
   weekly grouped GitHub Actions dependency updates live in the repository.

## Dependency Update Limitation

GitHub's Dependabot version updates do not currently support the repository's pinned pnpm 11
baseline. MergeVow enables vulnerability alerts and the repository security-updates setting, but
neither toggle guarantees automated pnpm 11 pull requests. Scheduled version updates are configured
only for GitHub Actions. This does not claim automated pnpm coverage.

## Conduct Reporting

No project-controlled email alias exists and the maintainer's local Git identity is not consent to
publish a personal address. Until a dedicated alias exists, the enabled GitHub private report form
is the monitored confidential channel for both security reports and reports prefixed `Conduct:`.

## Consequences

- A normal contributor cannot update `main` without a current three-platform CI result.
- A solo maintainer can still merge a compliant pull request without manufacturing a self-approval.
- Settings that live only on GitHub are verified through the API and summarized in this ADR.
- Adding a non-GitHub-owned action requires a deliberate policy and documentation change before its
  full-SHA reference can run.

## Guarantee Impact

None. These are ordinary repository governance controls. They do not select an accepted contract
from an exact base SHA, isolate candidate code, prevent a repository admin from changing policy, or
provide Local Cooperative, PR Drift Gate, or Protected Attestation guarantees.
