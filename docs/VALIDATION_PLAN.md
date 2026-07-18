# Validation Plan

## Goal

Validate demand for creating and retaining semantic browser contracts before investing in protected
GitHub enforcement.

## Stage 1: Artifact Interviews

Interview 15 people: five agent-heavy teams, five ordinary web developers, and five mature
QA/platform engineers as skeptical controls.

Continue when:

- At least 8/15 show a meaningful recent user-visible regression.
- At least 6/10 teams without mature QA manually verify UI weekly.
- At least five schedule a real pilot within seven days.

Store notes in `research/interviews/` without secrets or private source code.

## Stage 2: Concierge Pilots

On five real repositories, manually encode one flow with 3-8 checkpoints using existing Playwright
primitives. Run 20 unchanged replays, seed four regressions, and simulate one intentional change.

Continue when:

- Median setup is under 10 minutes.
- At least 80% of seeded regressions are caught.
- False failures remain below 5%.
- Intentional-change review takes under two minutes.
- At least 3/5 teams keep the check after two weeks.

Store sanitized results in `research/pilots/`.

## Stage 3: Private Alpha

Target ten repositories and at least 100 PR checks. Public beta requires five week-four active repos,
three required checks, two real regressions caught, and no secret incident.

## Positioning Test

Compare these messages using activation and retention, not likes:

1. “Show it once. Keep it working.”
2. “Your agent can edit code, not the definition of done.” Test this only as clearly labeled
   Protected Attestation positioning; use the qualified base-selection claim for V0.

If only agent-heavy teams retain, narrow the ICP. If users want evidence but reject the gate, test a
proof-artifact pivot.
