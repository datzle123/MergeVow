import { createServer, type IncomingMessage, type Server } from "node:http";
import { isIP, type Socket } from "node:net";
import type {
  APIRequestContext,
  APIResponse,
  Browser,
  BrowserContext,
  Frame,
  Request,
  Route,
  WebSocketRoute,
} from "playwright";
import { request as playwrightRequest } from "playwright";

const MAX_ORIGIN_LENGTH = 2_048;
const MAX_TRANSPORT_TIMEOUT_MS = 30_000;
const MAX_VIOLATION_TEXT_LENGTH = 4_096;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ROUTE_ALL = "**/*";
const UNSUPPORTED_API_BINDING = "__mergevowUnsupportedBrowserApi";
const UNSUPPORTED_BROWSER_APIS = {
  EventSource: "eventsource",
  RTCPeerConnection: "webrtc",
  SharedWorker: "worker",
  WebTransport: "webtransport",
  Worker: "worker",
  webkitRTCPeerConnection: "webrtc",
} as const;

export const NETWORK_GUARD_CODES = {
  externalNavigation: "EXTERNAL_NAVIGATION",
  externalRequest: "EXTERNAL_REQUEST",
  unsupportedBrowserApi: "UNSUPPORTED_BROWSER_API",
  unsupportedTransport: "UNSUPPORTED_TRANSPORT",
  unsupportedWebSocket: "UNSUPPORTED_WEBSOCKET",
} as const;

export const NETWORK_TRANSPORT_FAILURE_CODE = "NETWORK_TRANSPORT_FAILURE" as const;

export type NetworkGuardCode = (typeof NETWORK_GUARD_CODES)[keyof typeof NETWORK_GUARD_CODES];

export interface NetworkGuardViolation {
  readonly allowedOrigin: string;
  readonly code: NetworkGuardCode;
  readonly isNavigationRequest: boolean;
  readonly message: string;
  readonly method?: string;
  readonly redirectedFrom?: string;
  readonly resourceType: string;
  readonly url: string;
}

export interface NetworkTransportFailure {
  readonly code: typeof NETWORK_TRANSPORT_FAILURE_CODE;
  readonly isNavigationRequest: boolean;
  readonly message: string;
  readonly method?: string;
  readonly resourceType: string;
  readonly url: string;
}

export interface GuardedBrowserContext {
  readonly allowedOrigin: string;
  readonly close: () => Promise<void>;
  readonly context: BrowserContext;
  readonly getTransportFailure: () => NetworkTransportFailure | undefined;
  readonly getViolation: () => NetworkGuardViolation | undefined;
}

interface DenyProxy {
  readonly close: () => Promise<void>;
  readonly origin: string;
}

interface DenyProxyAttempt {
  readonly method: string;
  readonly resourceType: "transport" | "websocket";
  readonly url: string;
}

type UnsupportedBrowserApi =
  (typeof UNSUPPORTED_BROWSER_APIS)[keyof typeof UNSUPPORTED_BROWSER_APIS];

function boundedText(value: string, maximum = MAX_VIOLATION_TEXT_LENGTH): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 3)}...`;
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === "localhost") {
    return true;
  }
  const unwrapped =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  const ipVersion = isIP(unwrapped);
  return (
    (ipVersion === 4 && unwrapped.startsWith("127.")) || (ipVersion === 6 && unwrapped === "::1")
  );
}

function normalizeAllowedOrigin(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ORIGIN_LENGTH) {
    throw new TypeError("The allowed origin must be a bounded URL string.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("The allowed origin must be an absolute URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError("The allowed origin must use HTTP or HTTPS.");
  }
  if (!isLoopbackHostname(parsed.hostname)) {
    throw new TypeError("The allowed origin must use a loopback hostname.");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new TypeError("The allowed origin cannot contain credentials.");
  }
  if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
    throw new TypeError("The allowed origin cannot contain a path, query, or fragment.");
  }

  return parsed.origin;
}

function belongsToOrigin(value: string, allowedOrigin: string): boolean {
  try {
    return new URL(value).origin === allowedOrigin;
  } catch {
    return false;
  }
}

function requestViolation(request: Request, allowedOrigin: string): NetworkGuardViolation {
  const isNavigationRequest = request.isNavigationRequest();
  const code = isNavigationRequest
    ? NETWORK_GUARD_CODES.externalNavigation
    : NETWORK_GUARD_CODES.externalRequest;
  const url = boundedText(request.url());
  const redirectedFrom = request.redirectedFrom();
  const kind = isNavigationRequest ? "navigation" : "request";
  return Object.freeze({
    allowedOrigin,
    code,
    isNavigationRequest,
    message: boundedText(`Blocked ${kind} to ${url}; allowed origin is ${allowedOrigin}.`),
    method: boundedText(request.method(), 32),
    ...(redirectedFrom === null ? {} : { redirectedFrom: boundedText(redirectedFrom.url()) }),
    resourceType: boundedText(request.resourceType(), 64),
    url,
  });
}

function redirectViolation(
  request: Request,
  targetUrl: string,
  allowedOrigin: string,
): NetworkGuardViolation {
  const isNavigationRequest = request.isNavigationRequest();
  const code = isNavigationRequest
    ? NETWORK_GUARD_CODES.externalNavigation
    : NETWORK_GUARD_CODES.externalRequest;
  const url = boundedText(targetUrl);
  const redirectedFrom = boundedText(request.url());
  const kind = isNavigationRequest ? "navigation redirect" : "request redirect";
  return Object.freeze({
    allowedOrigin,
    code,
    isNavigationRequest,
    message: boundedText(`Blocked ${kind} to ${url}; allowed origin is ${allowedOrigin}.`),
    method: boundedText(request.method(), 32),
    redirectedFrom,
    resourceType: boundedText(request.resourceType(), 64),
    url,
  });
}

function frameViolation(frame: Frame, allowedOrigin: string): NetworkGuardViolation {
  const url = boundedText(frame.url());
  return Object.freeze({
    allowedOrigin,
    code: NETWORK_GUARD_CODES.externalNavigation,
    isNavigationRequest: true,
    message: boundedText(`Blocked navigation to ${url}; allowed origin is ${allowedOrigin}.`),
    resourceType: "document",
    url,
  });
}

function webSocketViolation(
  webSocket: WebSocketRoute,
  allowedOrigin: string,
): NetworkGuardViolation {
  const url = boundedText(webSocket.url());
  return Object.freeze({
    allowedOrigin,
    code: NETWORK_GUARD_CODES.unsupportedWebSocket,
    isNavigationRequest: false,
    message: boundedText(`Blocked unsupported WebSocket ${url}.`),
    resourceType: "websocket",
    url,
  });
}

function proxyAttemptViolation(
  attempt: DenyProxyAttempt,
  allowedOrigin: string,
): NetworkGuardViolation {
  const url = boundedText(attempt.url);
  const isWebSocket = attempt.resourceType === "websocket";
  return Object.freeze({
    allowedOrigin,
    code: isWebSocket
      ? NETWORK_GUARD_CODES.unsupportedWebSocket
      : NETWORK_GUARD_CODES.unsupportedTransport,
    isNavigationRequest: false,
    message: boundedText(
      isWebSocket
        ? `Blocked unsupported WebSocket ${url}.`
        : `Blocked unsupported browser transport to ${url}.`,
    ),
    method: boundedText(attempt.method, 32),
    resourceType: attempt.resourceType,
    url,
  });
}

function unsupportedBrowserApiViolation(
  api: UnsupportedBrowserApi,
  allowedOrigin: string,
): NetworkGuardViolation {
  return Object.freeze({
    allowedOrigin,
    code: NETWORK_GUARD_CODES.unsupportedBrowserApi,
    isNavigationRequest: false,
    message: boundedText(`Blocked unsupported browser API ${api}.`),
    resourceType: api,
    url: `${api}:`,
  });
}

function transportFailure(
  request: Request | undefined,
  error: unknown,
  fallbackUrl: string,
): NetworkTransportFailure {
  const isNavigationRequest = request?.isNavigationRequest() ?? false;
  const rawMessage = error instanceof Error ? error.message : String(error);
  const url = boundedText(request?.url() ?? fallbackUrl);
  return Object.freeze({
    code: NETWORK_TRANSPORT_FAILURE_CODE,
    isNavigationRequest,
    message: boundedText(`Guarded transport failed for ${url}: ${rawMessage}`),
    ...(request === undefined ? {} : { method: boundedText(request.method(), 32) }),
    resourceType: boundedText(request?.resourceType() ?? "transport", 64),
    url,
  });
}

function proxyAttempt(request: IncomingMessage, resourceType: "transport" | "websocket") {
  const rawUrl = request.url ?? "unknown";
  const url =
    resourceType === "websocket" && rawUrl.startsWith("http")
      ? rawUrl.replace(/^http/, "ws")
      : rawUrl;
  return Object.freeze({
    method: request.method ?? "UNKNOWN",
    resourceType,
    url,
  });
}

async function closeServer(server: Server, sockets: Set<Socket>): Promise<void> {
  for (const socket of sockets) {
    socket.destroy();
  }
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

async function startDenyProxy(
  onAttempt: (attempt: DenyProxyAttempt) => void,
  onFailure: (error: unknown) => void,
): Promise<DenyProxy> {
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    onAttempt(proxyAttempt(request, "transport"));
    response.statusCode = 403;
    response.setHeader("connection", "close");
    response.end("MergeVow guarded contexts do not permit direct proxy traffic.");
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("connect", (request, socket) => {
    onAttempt(proxyAttempt(request, "transport"));
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
  });
  server.on("upgrade", (request, socket) => {
    onAttempt(proxyAttempt(request, "websocket"));
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const onStartupError = (error: Error): void => reject(error);
      server.once("error", onStartupError);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", onStartupError);
        resolve();
      });
    });
  } catch (error) {
    await closeServer(server, sockets);
    throw error;
  }
  server.on("error", onFailure);
  server.unref();
  const address = server.address();
  if (address === null || typeof address === "string") {
    await closeServer(server, sockets);
    throw new Error("The guarded deny proxy did not bind to an IP endpoint.");
  }

  let closePromise: Promise<void> | undefined;
  return Object.freeze({
    close: () => {
      closePromise ??= closeServer(server, sockets);
      return closePromise;
    },
    origin: `http://127.0.0.1:${address.port}`,
  });
}

function isInternalFrameUrl(value: string): boolean {
  return value === "about:blank" || value === "about:srcdoc";
}

export async function createGuardedBrowserContext(
  browser: Browser,
  allowedOriginValue: string,
): Promise<GuardedBrowserContext> {
  const allowedOrigin = normalizeAllowedOrigin(allowedOriginValue);
  let violation: NetworkGuardViolation | undefined;
  let failure: NetworkTransportFailure | undefined;
  let closing = false;
  const activeTransports = new Set<APIRequestContext>();
  const recordViolation = (candidate: NetworkGuardViolation): void => {
    violation ??= candidate;
  };
  const recordFailure = (candidate: NetworkTransportFailure): void => {
    failure ??= candidate;
  };
  const denyProxy = await startDenyProxy(
    (attempt) => recordViolation(proxyAttemptViolation(attempt, allowedOrigin)),
    (error) => recordFailure(transportFailure(undefined, error, "deny-proxy")),
  );
  let context: BrowserContext;
  try {
    context = await browser.newContext({
      baseURL: `${allowedOrigin}/`,
      proxy: { bypass: new URL(allowedOrigin).host, server: denyProxy.origin },
      serviceWorkers: "block",
    });
  } catch (error) {
    await denyProxy.close();
    throw error;
  }

  const disposeTransport = async (transport: APIRequestContext): Promise<void> => {
    activeTransports.delete(transport);
    await transport.dispose().catch(() => undefined);
  };
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = (): Promise<void> => {
    closing = true;
    cleanupPromise ??= Promise.allSettled([
      ...Array.from(activeTransports, disposeTransport),
      denyProxy.close(),
    ]).then(() => undefined);
    return cleanupPromise;
  };
  const routeRequest = async (route: Route, request: Request): Promise<void> => {
    let response: APIResponse | undefined;
    let transport: APIRequestContext | undefined;
    try {
      if (!belongsToOrigin(request.url(), allowedOrigin)) {
        recordViolation(requestViolation(request, allowedOrigin));
        await route.abort("blockedbyclient");
        return;
      }

      transport = await playwrightRequest.newContext();
      activeTransports.add(transport);
      if (closing) {
        await route.abort("failed").catch(() => undefined);
        return;
      }
      response = await transport.fetch(request.url(), {
        data: request.postDataBuffer() ?? undefined,
        headers: await request.allHeaders(),
        maxRedirects: 0,
        maxRetries: 0,
        method: request.method(),
        timeout: MAX_TRANSPORT_TIMEOUT_MS,
      });
      const location = REDIRECT_STATUSES.has(response.status())
        ? response.headers().location
        : undefined;
      if (location !== undefined) {
        let targetUrl: string;
        try {
          targetUrl = new URL(location, request.url()).href;
        } catch {
          recordViolation(redirectViolation(request, location, allowedOrigin));
          await route.abort("blockedbyclient");
          return;
        }
        if (!belongsToOrigin(targetUrl, allowedOrigin)) {
          recordViolation(redirectViolation(request, targetUrl, allowedOrigin));
          await route.abort("blockedbyclient");
          return;
        }
      }
      await route.fulfill({ response });
    } catch (error) {
      if (!closing) {
        recordFailure(transportFailure(request, error, request.url()));
      }
      await route.abort("failed").catch(() => undefined);
    } finally {
      await response?.dispose().catch(() => undefined);
      if (transport !== undefined) {
        await disposeTransport(transport);
      }
    }
  };
  const routeWebSocket = async (webSocket: WebSocketRoute): Promise<void> => {
    recordViolation(webSocketViolation(webSocket, allowedOrigin));
    await webSocket
      .close({ code: 1008, reason: "WebSocket traffic is outside MergeVow V0." })
      .catch(() => undefined);
  };
  const observeNavigation = (frame: Frame): void => {
    const url = frame.url();
    if (!isInternalFrameUrl(url) && !belongsToOrigin(url, allowedOrigin)) {
      recordViolation(frameViolation(frame, allowedOrigin));
    }
  };

  try {
    await context.exposeBinding(UNSUPPORTED_API_BINDING, (_source, api: unknown) => {
      if (
        typeof api === "string" &&
        Object.values(UNSUPPORTED_BROWSER_APIS).includes(api as UnsupportedBrowserApi)
      ) {
        recordViolation(
          unsupportedBrowserApiViolation(api as UnsupportedBrowserApi, allowedOrigin),
        );
      }
    });
    await context.addInitScript(
      ({ bindingName, browserApis }) => {
        const target = globalThis as typeof globalThis & Record<string, unknown>;
        for (const [constructorName, api] of Object.entries(browserApis)) {
          if (typeof target[constructorName] !== "function") {
            continue;
          }
          const blockedConstructor = class {
            constructor() {
              const notify = target[bindingName];
              if (typeof notify === "function") {
                void notify(api);
              }
              throw new DOMException(
                `${constructorName} is outside the MergeVow V0 browser profile.`,
                "NotSupportedError",
              );
            }
          };
          Object.defineProperty(blockedConstructor, "name", { value: constructorName });
          Object.defineProperty(target, constructorName, {
            configurable: false,
            value: blockedConstructor,
            writable: false,
          });
        }
      },
      { bindingName: UNSUPPORTED_API_BINDING, browserApis: UNSUPPORTED_BROWSER_APIS },
    );
    await context.route(ROUTE_ALL, routeRequest);
    await context.routeWebSocket(ROUTE_ALL, routeWebSocket);
    context.on("framenavigated", observeNavigation);
  } catch (error) {
    await context.close();
    await cleanup();
    throw error;
  }
  context.once("close", () => {
    void cleanup();
  });

  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closePromise ??= (async () => {
      closing = true;
      await context.unrouteAll({ behavior: "ignoreErrors" }).catch(() => undefined);
      await Promise.allSettled([context.close(), cleanup()]);
    })();
    return closePromise;
  };

  return Object.freeze({
    allowedOrigin,
    close,
    context,
    getTransportFailure: () => failure,
    getViolation: () => violation,
  });
}
