# @mergevow/recorder

Workspace-only action capture for Contract V1. A caller supplies a pinned Chromium browser (headed
for human authoring), one exact loopback origin, a start path, and a flow name. The session owns a
fresh guarded context and returns either one validated frozen contract or one bounded failure; it
never returns partial steps. Invalid caller options use deterministic `TypeError`s; runtime startup
uses `ActionRecorderStartError` with one frozen bounded issue.

Captured actions are `visit`, `click`, `fill`, `select`, `check`, and `reload`. Persisted locators are
limited to exact role/name, label, and test ID. A bundled standards-based accessible-name algorithm
creates bounded event-time proofs, with an opportunistic live Playwright recheck. Consecutive fills
for one element keep the first replayable locator and coalesce to the latest value. Causal
main-frame-request tracking prevents a click from owning unrelated later navigation. Passwords,
files, uncheck, implicit/programmatic submits, unsupported controls, browser dialogs,
invalid/ambiguous locators, frames, additional pages, resource limits, and guarded-network failures
invalidate the recording.

The returned contract has no fields for cookies, authorization headers, raw request or response
bodies, local/session storage, or Playwright storage state. The guarded driver still relays
same-origin headers and bodies, and page-derived contract strings can contain sensitive data. The
injected DOM observation runs only in a cooperative Local Cooperative authoring session and is not a
hostile-page isolation boundary. Assertions and checkpoint UI belong to `SW-009`; configured
sensitive-value redaction belongs to `SW-010`.
