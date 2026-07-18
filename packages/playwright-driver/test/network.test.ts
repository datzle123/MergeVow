import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";

import type { Browser } from "playwright";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createGuardedBrowserContext,
  type GuardedBrowserContext,
  NETWORK_GUARD_CODES,
  NETWORK_TRANSPORT_FAILURE_CODE,
} from "../src/index.js";

interface LoopbackResponse {
  readonly body?: string;
  readonly destroySocket?: boolean;
  readonly headers?: Readonly<Record<string, string | readonly string[]>>;
  readonly location?: string;
  readonly status?: number;
  readonly stream?: boolean;
}

interface LoopbackServer {
  readonly close: () => Promise<void>;
  readonly origin: string;
  readonly requests: string[];
  readonly server: Server;
  readonly upgrades: string[];
}

async function startLoopbackServer(
  handler: (path: string, server: LoopbackServer, request: IncomingMessage) => LoopbackResponse,
): Promise<LoopbackServer> {
  const requests: string[] = [];
  const upgrades: string[] = [];
  const sockets = new Set<Socket>();
  let fixture: LoopbackServer;
  const server = createServer((request, response) => {
    const path = request.url ?? "/";
    requests.push(path);
    const result = handler(path, fixture, request);
    if (result.destroySocket === true) {
      request.socket.destroy();
      return;
    }
    response.statusCode = result.status ?? 200;
    if (result.location !== undefined) {
      response.setHeader("location", result.location);
    }
    for (const [name, value] of Object.entries(result.headers ?? {})) {
      response.setHeader(name, value as string | string[]);
    }
    if (!Object.keys(result.headers ?? {}).some((name) => name.toLowerCase() === "content-type")) {
      response.setHeader(
        "content-type",
        path.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8",
      );
    }
    if (result.stream === true) {
      response.write(result.body ?? "");
      return;
    }
    response.end(result.body ?? "");
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (request, socket) => {
    upgrades.push(request.url ?? "/");
    socket.destroy();
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  fixture = {
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    server,
    upgrades,
  };
  return fixture;
}

async function withGuardedContext(
  guarded: GuardedBrowserContext,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } finally {
    await guarded.close();
  }
}

describe("loopback same-origin browser guard", () => {
  let allowed: LoopbackServer;
  let browser: Browser;
  let external: LoopbackServer;
  const observedCookies: string[] = [];

  beforeAll(async () => {
    external = await startLoopbackServer(() => ({ body: "external" }));
    allowed = await startLoopbackServer((path, _server, request) => {
      if (path === "/redirect-same") {
        return { location: "/ok", status: 302 };
      }
      if (path === "/redirect-external") {
        return { location: `${external.origin}/redirect-target`, status: 302 };
      }
      if (path === "/redirect-fetch-external") {
        return { location: `${external.origin}/fetch-redirect-target`, status: 307 };
      }
      if (path === "/asset.js") {
        return { body: "globalThis.__sameOriginAsset = true;" };
      }
      if (path === "/api") {
        return { body: "same-origin-api" };
      }
      if (path === "/seed-cookies") {
        return {
          body: "seeded",
          headers: {
            "set-cookie": [
              "session=secret; HttpOnly; SameSite=Lax; Path=/",
              "theme=dark; SameSite=Lax; Path=/",
            ],
          },
        };
      }
      if (path.startsWith("/cookie-probe")) {
        observedCookies.push(request.headers.cookie ?? "");
        const name = path.includes("mode=include") ? "included" : "omitted";
        return {
          body: request.headers.cookie ?? "",
          headers: { "set-cookie": `${name}=stored; SameSite=Lax; Path=/` },
        };
      }
      if (path === "/broken.js") {
        return { destroySocket: true };
      }
      if (path === "/slow-stream") {
        return {
          body: "data: partial\n\n",
          headers: { "content-type": "text/event-stream; charset=utf-8" },
          stream: true,
        };
      }
      if (path === "/worker.js") {
        return {
          body: `new WebSocket("${external.origin.replace(/^http/, "ws")}/worker-socket");`,
        };
      }
      if (path === "/sw.js") {
        return { body: "self.addEventListener('fetch', () => {});" };
      }
      if (path === "/external-subresource") {
        return { body: `<!doctype html><img src="${external.origin}/pixel.png" alt="blocked">` };
      }
      return {
        body: '<!doctype html><script src="/asset.js"></script><h1>Allowed</h1>',
      };
    });
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  afterAll(async () => {
    await browser.close();
    await Promise.all([allowed.close(), external.close()]);
  });

  it("allows exact-origin navigation, subresources, and fetch", async () => {
    const guarded = await createGuardedBrowserContext(browser, allowed.origin);
    await withGuardedContext(guarded, async () => {
      const page = await guarded.context.newPage();

      await page.goto("/ok");
      const api = await page.evaluate(() => fetch("/api").then((response) => response.text()));

      expect(api).toBe("same-origin-api");
      expect(await page.evaluate(() => Reflect.get(globalThis, "__sameOriginAsset"))).toBe(true);
      expect(guarded.getViolation()).toBeUndefined();
    });
  });

  it("rejects invalid or remote origins before creating a context", async () => {
    const initialContexts = browser.contexts().length;
    const invalidOrigins = [
      "https://example.com",
      "ftp://127.0.0.1",
      "http://user:secret@127.0.0.1",
      "http://127.0.0.1/app",
      "http://127.0.0.1/?query=1",
      "not a URL",
    ];

    for (const origin of invalidOrigins) {
      await expect(createGuardedBrowserContext(browser, origin)).rejects.toThrow(/origin/i);
    }
    expect(browser.contexts()).toHaveLength(initialContexts);
  });

  it("accepts canonical localhost, IPv4 loopback, and IPv6 loopback origins", async () => {
    for (const origin of ["http://localhost:4100", "http://127.0.0.2:4100", "http://[::1]:4100"]) {
      const guarded = await createGuardedBrowserContext(browser, origin);
      expect(guarded.allowedOrigin).toBe(new URL(origin).origin);
      await guarded.close();
    }
  });

  it("blocks direct cross-origin navigation before the destination receives it", async () => {
    external.requests.length = 0;
    const guarded = await createGuardedBrowserContext(browser, allowed.origin);
    await withGuardedContext(guarded, async () => {
      const page = await guarded.context.newPage();

      await expect(page.goto(`${external.origin}/direct`)).rejects.toThrow();

      expect(external.requests).toEqual([]);
      expect(guarded.getViolation()).toMatchObject({
        allowedOrigin: allowed.origin,
        code: NETWORK_GUARD_CODES.externalNavigation,
        isNavigationRequest: true,
        method: "GET",
        resourceType: "document",
        url: `${external.origin}/direct`,
      });
      expect(Object.isFrozen(guarded.getViolation())).toBe(true);
    });
  });

  it("blocks cross-origin fetch and retains bounded first-violation data", async () => {
    external.requests.length = 0;
    const guarded = await createGuardedBrowserContext(browser, allowed.origin);
    await withGuardedContext(guarded, async () => {
      const page = await guarded.context.newPage();
      await page.goto("/ok");
      const longUrl = `${external.origin}/fetch?value=${"x".repeat(10_000)}`;

      const outcome = await page.evaluate(async (url) => {
        try {
          await fetch(url);
          return "resolved";
        } catch {
          return "rejected";
        }
      }, longUrl);

      expect(outcome).toBe("rejected");
      expect(external.requests).toEqual([]);
      expect(guarded.getViolation()).toMatchObject({
        code: NETWORK_GUARD_CODES.externalRequest,
        isNavigationRequest: false,
        method: "GET",
        resourceType: "fetch",
      });
      expect(guarded.getViolation()?.url.length).toBeLessThanOrEqual(4_096);
      expect(guarded.getViolation()?.message.length).toBeLessThanOrEqual(4_096);
      const firstViolation = guarded.getViolation();
      await page.evaluate(async (url) => {
        await fetch(url).catch(() => undefined);
      }, `${external.origin}/later-request`);
      expect(external.requests).toEqual([]);
      expect(guarded.getViolation()).toBe(firstViolation);
    });
  });

  it("blocks a cross-origin subresource before the destination receives it", async () => {
    external.requests.length = 0;
    const guarded = await createGuardedBrowserContext(browser, allowed.origin);
    await withGuardedContext(guarded, async () => {
      const page = await guarded.context.newPage();

      await page.goto("/external-subresource");

      expect(external.requests).toEqual([]);
      expect(guarded.getViolation()).toMatchObject({
        code: NETWORK_GUARD_CODES.externalRequest,
        isNavigationRequest: false,
        resourceType: "image",
        url: `${external.origin}/pixel.png`,
      });
    });
  });

  it("allows same-origin redirects and blocks cross-origin redirect targets", async () => {
    const sameOrigin = await createGuardedBrowserContext(browser, allowed.origin);
    await withGuardedContext(sameOrigin, async () => {
      const page = await sameOrigin.context.newPage();
      await page.goto("/redirect-same");
      expect(page.url()).toBe(`${allowed.origin}/ok`);
      expect(sameOrigin.getViolation()).toBeUndefined();
    });

    external.requests.length = 0;
    const crossOrigin = await createGuardedBrowserContext(browser, allowed.origin);
    await withGuardedContext(crossOrigin, async () => {
      const page = await crossOrigin.context.newPage();
      await page.goto("/redirect-external").catch(() => undefined);
      expect(external.requests).toEqual([]);
      expect(page.url()).not.toBe(`${external.origin}/redirect-target`);
      expect(crossOrigin.getViolation()).toMatchObject({
        code: NETWORK_GUARD_CODES.externalNavigation,
        redirectedFrom: `${allowed.origin}/redirect-external`,
        url: `${external.origin}/redirect-target`,
      });
    });
  });

  it("prevents a same-origin fetch response from redirecting externally", async () => {
    external.requests.length = 0;
    const guarded = await createGuardedBrowserContext(browser, allowed.origin);
    await withGuardedContext(guarded, async () => {
      const page = await guarded.context.newPage();
      await page.goto("/ok");

      const outcome = await page.evaluate(async () => {
        try {
          await fetch("/redirect-fetch-external");
          return "resolved";
        } catch {
          return "rejected";
        }
      });

      expect(outcome).toBe("rejected");
      expect(external.requests).toEqual([]);
      expect(guarded.getViolation()).toMatchObject({
        code: NETWORK_GUARD_CODES.externalRequest,
        isNavigationRequest: false,
        redirectedFrom: `${allowed.origin}/redirect-fetch-external`,
        resourceType: "fetch",
        url: `${external.origin}/fetch-redirect-target`,
      });
    });
  });

  it("poisons the guard on a non-origin document navigation", async () => {
    const guarded = await createGuardedBrowserContext(browser, allowed.origin);
    await withGuardedContext(guarded, async () => {
      const page = await guarded.context.newPage();
      await page.goto("/ok");

      await page.goto("data:text/html,<h1>Not same origin</h1>");

      expect(guarded.getViolation()).toMatchObject({
        code: NETWORK_GUARD_CODES.externalNavigation,
        isNavigationRequest: true,
        resourceType: "document",
      });
    });
  });

  it("blocks unsupported WebSocket traffic without connecting", async () => {
    external.upgrades.length = 0;
    const guarded = await createGuardedBrowserContext(browser, allowed.origin);
    await withGuardedContext(guarded, async () => {
      const page = await guarded.context.newPage();
      await page.goto("/ok");
      const webSocketUrl = external.origin.replace(/^http/, "ws");

      await page.evaluate((url) => {
        new WebSocket(`${url}/socket`);
      }, webSocketUrl);
      await expect
        .poll(() => guarded.getViolation()?.code)
        .toBe(NETWORK_GUARD_CODES.unsupportedWebSocket);

      expect(external.upgrades).toEqual([]);
      expect(guarded.getViolation()).toMatchObject({
        resourceType: "websocket",
        url: `${webSocketUrl}/socket`,
      });
    });
  });

  it("bypasses an inherited launch proxy with the direct guarded transport", async () => {
    const launchProxy = await startLoopbackServer(() => ({
      body: "<!doctype html><h1>Forged by launch proxy</h1>",
    }));
    const proxiedBrowser = await chromium.launch({
      headless: true,
      proxy: { server: launchProxy.origin },
    });
    try {
      launchProxy.requests.length = 0;
      allowed.requests.length = 0;
      const guarded = await createGuardedBrowserContext(proxiedBrowser, allowed.origin);
      await withGuardedContext(guarded, async () => {
        const page = await guarded.context.newPage();

        await page.goto("/ok");

        expect(await page.getByRole("heading", { name: "Allowed" }).count()).toBe(1);
        expect(launchProxy.requests).toEqual([]);
        expect(allowed.requests).toContain("/ok");
        expect(guarded.getViolation()).toBeUndefined();
        expect(guarded.getTransportFailure()).toBeUndefined();
      });
    } finally {
      await proxiedBrowser.close();
      await launchProxy.close();
    }
  });

  it("preserves browser cookie credentials semantics", async () => {
    observedCookies.length = 0;
    const guarded = await createGuardedBrowserContext(browser, allowed.origin);
    await withGuardedContext(guarded, async () => {
      const page = await guarded.context.newPage();
      await page.goto("/seed-cookies");

      expect((await guarded.context.cookies()).map((cookie) => cookie.name).sort()).toEqual([
        "session",
        "theme",
      ]);

      await page.evaluate(() =>
        fetch("/cookie-probe?mode=omit", { credentials: "omit" }).then((response) =>
          response.text(),
        ),
      );
      expect(observedCookies.at(-1)).toBe("");
      expect((await guarded.context.cookies()).map((cookie) => cookie.name)).not.toContain(
        "omitted",
      );

      await page.evaluate(() =>
        fetch("/cookie-probe?mode=include", { credentials: "include" }).then((response) =>
          response.text(),
        ),
      );
      expect(observedCookies.at(-1)).toContain("session=secret");
      const cookieNames = (await guarded.context.cookies()).map((cookie) => cookie.name);
      expect(cookieNames).toContain("included");
      expect(cookieNames).not.toContain("omitted");
      expect(guarded.getViolation()).toBeUndefined();
      expect(guarded.getTransportFailure()).toBeUndefined();
    });
  });

  it("blocks dedicated workers before a worker WebSocket can connect", async () => {
    external.upgrades.length = 0;
    const guarded = await createGuardedBrowserContext(browser, allowed.origin);
    await withGuardedContext(guarded, async () => {
      const page = await guarded.context.newPage();
      await page.goto("/ok");
      allowed.requests.length = 0;

      const outcome = await page.evaluate(() => {
        try {
          new Worker("/worker.js");
          return "opened";
        } catch (error) {
          return error instanceof DOMException ? error.name : "unexpected";
        }
      });

      expect(outcome).toBe("NotSupportedError");
      await expect.poll(() => guarded.getViolation()?.resourceType).toBe("worker");
      expect(guarded.getViolation()?.code).toBe(NETWORK_GUARD_CODES.unsupportedBrowserApi);
      expect(allowed.requests).not.toContain("/worker.js");
      expect(external.upgrades).toEqual([]);
    });
  });

  it.each([
    ["EventSource", "eventsource", ["/events"]],
    ["RTCPeerConnection", "webrtc", []],
    ["WebTransport", "webtransport", ["https://127.0.0.1:9/transport"]],
  ] as const)("blocks the unsupported %s API", async (constructorName, resourceType, args) => {
    const guarded = await createGuardedBrowserContext(browser, allowed.origin);
    await withGuardedContext(guarded, async () => {
      const page = await guarded.context.newPage();
      await page.goto("/ok");

      const outcome = await page.evaluate(
        ({ name, constructorArgs }) => {
          const browserConstructor = Reflect.get(globalThis, name);
          if (typeof browserConstructor !== "function") {
            return "unavailable";
          }
          try {
            Reflect.construct(browserConstructor, constructorArgs);
            return "opened";
          } catch (error) {
            return error instanceof DOMException ? error.name : "unexpected";
          }
        },
        { name: constructorName, constructorArgs: [...args] },
      );

      expect(outcome).toBe("NotSupportedError");
      await expect.poll(() => guarded.getViolation()?.resourceType).toBe(resourceType);
      expect(guarded.getViolation()?.code).toBe(NETWORK_GUARD_CODES.unsupportedBrowserApi);
    });
  });

  it("retains a bounded transport failure without leaking a route rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    const guarded = await createGuardedBrowserContext(browser, allowed.origin);
    try {
      const page = await guarded.context.newPage();
      await page.goto("/ok");

      const outcome = await page.evaluate(
        () =>
          new Promise<string>((resolve) => {
            const script = document.createElement("script");
            script.src = "/broken.js";
            script.addEventListener("load", () => resolve("loaded"));
            script.addEventListener("error", () => resolve("failed"));
            document.head.append(script);
          }),
      );

      expect(outcome).toBe("failed");
      await expect
        .poll(() => guarded.getTransportFailure()?.code)
        .toBe(NETWORK_TRANSPORT_FAILURE_CODE);
      expect(guarded.getTransportFailure()).toMatchObject({
        isNavigationRequest: false,
        method: "GET",
        resourceType: "script",
        url: `${allowed.origin}/broken.js`,
      });
      expect(Object.isFrozen(guarded.getTransportFailure())).toBe(true);
      expect(guarded.getViolation()).toBeUndefined();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      await guarded.close();
    }
  });

  it("closes an in-flight streaming transport without an unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    const guarded = await createGuardedBrowserContext(browser, allowed.origin);
    try {
      const page = await guarded.context.newPage();
      await page.goto("/ok");
      allowed.requests.length = 0;
      const pendingFetch = page
        .evaluate(() => fetch("/slow-stream").then(() => "resolved"))
        .catch(() => "page-closed");
      await expect.poll(() => allowed.requests).toContain("/slow-stream");

      await guarded.close();
      await guarded.close();
      await pendingFetch;
      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(unhandled).toEqual([]);
      expect(guarded.getTransportFailure()).toBeUndefined();
    } finally {
      process.off("unhandledRejection", onUnhandled);
      await guarded.close();
    }
  });

  it("creates the context with Service Workers blocked", async () => {
    const guarded = await createGuardedBrowserContext(browser, allowed.origin);
    await withGuardedContext(guarded, async () => {
      const page = await guarded.context.newPage();
      await page.goto("/ok");

      const registration = await page.evaluate(async () => {
        const value: unknown = await navigator.serviceWorker.register("/sw.js");
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (value === undefined) {
          return { blocked: true };
        }
        const worker = value as ServiceWorkerRegistration;
        return {
          active: worker.active !== null,
          blocked: false,
          installing: worker.installing !== null,
          waiting: worker.waiting !== null,
        };
      });

      expect(registration).toEqual({ blocked: true });
      expect(guarded.context.serviceWorkers()).toEqual([]);
      expect(guarded.getViolation()).toBeUndefined();
    });
  });
});
