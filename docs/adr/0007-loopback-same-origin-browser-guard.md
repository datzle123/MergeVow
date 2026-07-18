# ADR-0007: Loopback Same-Origin Browser Guard

Status: Accepted<br>
Date: 2026-07-19

## Context

Contract V1 permits only origin-relative `visit` paths, but schema validation cannot stop an
application response, script, subresource, or redirect from reaching another origin. Playwright's
request routing also has an important boundary: continuing an allowed request can let its redirect
chain reach the network without invoking the route handler again. The browser-context request client
is also unsuitable for redirect preflight: it inherits a browser launch proxy and shares the browser
cookie jar, which changes `fetch(..., { credentials: "omit" })` behavior.

MergeVow needs a deterministic browser primitive for the persistence vertical slice without
claiming process-wide egress control or hostile-code isolation.

## Decision

The Playwright driver package creates a guarded browser context that:

1. Accepts one trusted, origin-only HTTP(S) loopback URL: `localhost`, IPv4 `127.0.0.0/8`, or IPv6
   `::1`.
2. Starts an owned loopback deny proxy, overrides any browser launch proxy at the context, bypasses
   that proxy only for the exact allowed host and port, blocks Service Workers, and installs every
   handler before creating a page.
3. Aborts routed HTTP(S) requests outside the allowed origin. Each allowed request is replayed with
   its browser-observed headers and body through a fresh, direct, cookie-isolated request context.
4. Disables automatic redirects in that direct transport, inspects each redirect `Location`, and
   fulfills the response only when the target remains on the allowed origin. Chromium remains
   responsible for applying response cookies according to the original request's credentials mode.
5. Routes page/frame WebSockets to a rejecting handler. Dedicated/shared workers, EventSource,
   WebTransport, and WebRTC constructors are rejected as unsupported V0 APIs; the deny proxy rejects
   non-routed proxy attempts before they reach another endpoint.
6. Observes non-origin frame navigation that does not use HTTP(S), such as `data:`, and poisons the
   guard for the future driver to classify.
7. Retains the first policy violation and first transport failure separately as frozen, bounded
   data. Route callbacks never leak an unhandled rejection.
8. Owns idempotent closure of active request clients, routes, browser context, and deny proxy.

Network policy is trusted runner configuration. It is not contract data and cannot introduce a
callback or executable field.

## Consequences

- Exact same-origin requests and redirects work; a scheme, host, or port change fails closed.
- External document, fetch, and subresource destinations are blocked before the destination server
  receives the HTTP request.
- A caller-supplied browser launch proxy cannot observe or forge an allowed request. Fresh request
  clients preserve browser cookie inclusion and prevent helper-cookie state from crossing requests.
- Routing disables the browser HTTP cache and buffers allowed responses through Playwright.
  Streaming fetch responses remain outside the supported profile and are bounded by trusted timeout
  and owned-close behavior.
- Service Worker, dedicated/shared worker, SSE/EventSource, WebSocket, WebTransport, WebRTC,
  multi-tab, and real-time flows remain V0 non-goals.
- Apps that require CDN or third-party resources are outside the loginless same-origin V0 profile.
- The future driver must check both retained policy and transport state before and after each
  operation.
- The raw context remains a trusted internal primitive. Trusted code could close it, remove routes,
  or create another unguarded context.

## Guarantee Impact

This is Local Cooperative request-level and supported-browser-API infrastructure. Constructor
rejection is compatibility enforcement, not a hostile-code security boundary. The guard does not
claim control of browser-internal or future channels, candidate processes, dependency installation,
DNS behavior, other runner software, or operating-system egress. It is not a sandbox, does not
isolate a hostile candidate, and does not establish the PR Drift Gate.
