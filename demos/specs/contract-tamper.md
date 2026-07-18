# Demo: Contract Tampering

## Purpose

Demonstrate exact-base oracle selection without overstating malicious-code protection.

## Candidate Change

Break persistence and change the head contract to assert only that a success toast appeared.

## Expected Result

Ordinary head-owned verification may pass. The configured MergeVow gate loads the contract from one
exact base SHA, reloads the page, and reports the missing persisted item as `REGRESSION`. Independently,
the changed head contract produces `proposalStatus = CHANGE_REQUIRES_APPROVAL`; it never replaces the
base-selected oracle.
