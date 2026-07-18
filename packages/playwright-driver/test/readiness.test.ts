import type { AddressInfo, Socket } from "node:net";
import { createServer } from "node:net";

import { describe, expect, it } from "vitest";

import {
  LOOPBACK_READINESS_CODES,
  LoopbackReadinessError,
  waitForLoopbackReady,
} from "../src/index.js";
import { startTestLoopbackServer } from "./loopback.js";

describe("loopback application readiness", () => {
  it.each([404, 500])("treats an HTTP %s response as listener-ready", async (status) => {
    const server = await startTestLoopbackServer((_request, response) => {
      response.statusCode = status;
      response.end("not semantically ready");
    });
    try {
      await expect(waitForLoopbackReady(server.origin, { timeoutMs: 1_000 })).resolves.toBe(
        undefined,
      );
      expect(server.requests).toEqual(["/"]);
    } finally {
      await server.close();
    }
  });

  it("does not follow a readiness redirect", async () => {
    const destination = await startTestLoopbackServer((_request, response) => {
      response.end("destination");
    });
    const redirect = await startTestLoopbackServer((_request, response) => {
      response.statusCode = 302;
      response.setHeader("location", `${destination.origin}/followed`);
      response.end();
    });
    try {
      await waitForLoopbackReady(redirect.origin, { timeoutMs: 1_000 });
      expect(redirect.requests).toEqual(["/"]);
      expect(destination.requests).toEqual([]);
    } finally {
      await Promise.all([redirect.close(), destination.close()]);
    }
  });

  it("retries connection refusal until the listener starts", async () => {
    const reservation = await startTestLoopbackServer((_request, response) => response.end());
    const { origin, port } = reservation;
    await reservation.close();

    let started: Awaited<ReturnType<typeof startTestLoopbackServer>> | undefined;
    const delayedStart = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        void startTestLoopbackServer((_request, response) => response.end("ready"), port).then(
          (server) => {
            started = server;
            resolve();
          },
          reject,
        );
      }, 75);
    });

    try {
      await waitForLoopbackReady(origin, { retryIntervalMs: 20, timeoutMs: 2_000 });
      await delayedStart;
      expect(started?.requests).toEqual(["/"]);
    } finally {
      await started?.close();
    }
  });

  it("times out when a listener accepts but never responds", async () => {
    const server = await startTestLoopbackServer(() => undefined);
    try {
      const error = await waitForLoopbackReady(server.origin, {
        attemptTimeoutMs: 40,
        retryIntervalMs: 10,
        timeoutMs: 120,
      }).catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(LoopbackReadinessError);
      expect(error).toMatchObject({ code: LOOPBACK_READINESS_CODES.timeout });
    } finally {
      await server.close();
    }
  });

  it("enforces an absolute deadline while a listener trickles incomplete headers", async () => {
    const sockets = new Set<Socket>();
    const intervals = new Set<ReturnType<typeof setInterval>>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("error", () => undefined);
      socket.once("close", () => sockets.delete(socket));
      socket.write("HTTP/1.1 200 OK\r\nX-Slow: ");
      const interval = setInterval(() => {
        if (!socket.destroyed && socket.writable) {
          socket.write("a");
        }
      }, 10);
      intervals.add(interval);
      socket.once("close", () => {
        clearInterval(interval);
        intervals.delete(interval);
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    const controller = new AbortController();
    const fallback = setTimeout(() => controller.abort("test fallback"), 500);

    try {
      const error = await waitForLoopbackReady(`http://127.0.0.1:${address.port}`, {
        attemptTimeoutMs: 40,
        retryIntervalMs: 10,
        signal: controller.signal,
        timeoutMs: 120,
      }).catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(LoopbackReadinessError);
      expect(error).toMatchObject({ code: LOOPBACK_READINESS_CODES.timeout });
    } finally {
      clearTimeout(fallback);
      for (const interval of intervals) {
        clearInterval(interval);
      }
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    }
  });

  it("cancels a pending readiness probe", async () => {
    const server = await startTestLoopbackServer(() => undefined);
    const controller = new AbortController();
    setTimeout(() => controller.abort("test cancellation"), 25);
    try {
      const error = await waitForLoopbackReady(server.origin, {
        attemptTimeoutMs: 1_000,
        signal: controller.signal,
        timeoutMs: 2_000,
      }).catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(LoopbackReadinessError);
      expect(error).toMatchObject({ code: LOOPBACK_READINESS_CODES.cancelled });
    } finally {
      await server.close();
    }
  });

  it("rejects a non-loopback or path-bearing origin before probing", async () => {
    await expect(waitForLoopbackReady("https://example.com", { timeoutMs: 100 })).rejects.toThrow(
      /loopback/i,
    );
    await expect(
      waitForLoopbackReady("http://127.0.0.1:3000/app", { timeoutMs: 100 }),
    ).rejects.toThrow(/path/i);
  });
});
