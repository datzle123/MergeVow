# @mergevow/recorder

Workspace-only Contract V1 authoring. A caller supplies a pinned Chromium browser (headed for human
authoring), one exact loopback origin, a start path, and a flow name. The session owns a fresh guarded
context and returns either one validated frozen contract or one bounded failure; it never returns
partial steps. Invalid caller options use deterministic `TypeError`s; runtime startup uses
`ActionRecorderStartError` with one frozen bounded issue.

Launch the pinned full Chromium build with the recorder-owned background-service switches before
starting a headed authoring session:

```ts
import { chromium } from "playwright";
import { RECORDER_CHROMIUM_LAUNCH_ARGS, startActionRecorder } from "@mergevow/recorder";

const browser = await chromium.launch({
  args: [...RECORDER_CHROMIUM_LAUNCH_ARGS],
  headless: false,
});
```

The switch preserves pinned Playwright 1.61.1's disabled-feature baseline and stops browser-owned
search preconnect, AIM eligibility, autofill-service, and network-time traffic. It does not bypass or
weaken the guarded context. Full Chromium can still initiate browser-profile GAIA sign-in and GCM
messaging traffic outside page requests; this package does not claim process-wide egress control. The
future CLI launcher will own this call, update the union with the pinned Playwright version, and pair
it with trusted-runner network isolation where that stronger boundary is required.

Captured actions are `visit`, `click`, `fill`, `select`, `check`, and `reload`. Persisted locators are
limited to exact role/name, label, and test ID. A bundled standards-based accessible-name algorithm
creates bounded event-time proofs, with an opportunistic live Playwright recheck. Consecutive fills
for one element keep the first replayable locator and coalesce to the latest value. Causal
main-frame-request tracking prevents a click from owning unrelated later navigation. Direct password
controls are rejected before candidate computation; semantic-name paths that reach them are omitted
before accessible-name computation. Files, uncheck, implicit/programmatic submits, unsupported
controls, browser dialogs, invalid/ambiguous locators, frames, additional pages, resource limits, and
guarded-network failures invalidate the recording.

Set `checkpointOverlay: true` to mount the SW-009 tool surface in an open Shadow DOM. It captures all
eight approved assertions: visible, hidden, URL, text, value, count, checked, and disabled. Visible
targets use one consumed pointer-picking gesture; hidden targets use a bounded semantic list. The
pointer picker collapses to a compact cancel surface so it does not cover page targets, while
keyboard activation opens a bounded semantic target list. The user chooses an eligible exact
semantic locator, while count may deliberately keep a non-unique locator with its observed count.
Confirmation re-captures the selected state; confirmed checkpoints share the action queue, so
pending fills, actions, and assertions retain source order. Cancel and invalid selection emit
nothing.

The returned contract has no fields for cookies, authorization headers, raw request or response
bodies, local/session storage, or Playwright storage state. The guarded driver still relays
same-origin headers and bodies, and page-derived contract strings can contain sensitive data. The
injected DOM observation runs only in a cooperative Local Cooperative authoring session and is not a
hostile-page isolation boundary. The page can observe or interfere with the open authoring surface,
so it does not prove human selection. Configured sensitive-value redaction belongs to `SW-010`.
