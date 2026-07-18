import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { performance } from "node:perf_hooks";

import { normalizeLoopbackOrigin } from "./network.js";

const MAX_ERROR_MESSAGE_LENGTH = 1_024;

export const LOOPBACK_READINESS_CODES = {
  cancelled: "READINESS_CANCELLED",
  timeout: "READINESS_TIMEOUT",
} as const;

export type LoopbackReadinessCode =
  (typeof LOOPBACK_READINESS_CODES)[keyof typeof LOOPBACK_READINESS_CODES];

export const LOOPBACK_READINESS_LIMITS = Object.freeze({
  defaultAttemptTimeoutMs: 500,
  defaultRetryIntervalMs: 50,
  defaultTimeoutMs: 10_000,
  maxAttemptTimeoutMs: 5_000,
  maxRetryIntervalMs: 1_000,
  maxTimeoutMs: 60_000,
  minTimeoutMs: 1,
});

export interface LoopbackReadinessOptions {
  readonly attemptTimeoutMs?: number;
  readonly retryIntervalMs?: number;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export class LoopbackReadinessError extends Error {
  readonly code: LoopbackReadinessCode;
  readonly lastError?: string;

  constructor(code: LoopbackReadinessCode, message: string, lastError?: string) {
    super(message);
    this.name = "LoopbackReadinessError";
    this.code = code;
    if (lastError !== undefined) {
      this.lastError = lastError;
    }
  }
}

interface ReadinessPolicy {
  readonly attemptTimeoutMs: number;
  readonly retryIntervalMs: number;
  readonly timeoutMs: number;
}

function boundedErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Readiness probe failed.";
  return message.length <= MAX_ERROR_MESSAGE_LENGTH
    ? message
    : `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3)}...`;
}

function boundedInteger(value: number, maximum: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= LOOPBACK_READINESS_LIMITS.minTimeoutMs &&
    value <= maximum
  );
}

function readinessPolicy(options: LoopbackReadinessOptions): ReadinessPolicy {
  const timeoutMs = options.timeoutMs ?? LOOPBACK_READINESS_LIMITS.defaultTimeoutMs;
  const attemptTimeoutMs =
    options.attemptTimeoutMs ?? LOOPBACK_READINESS_LIMITS.defaultAttemptTimeoutMs;
  const retryIntervalMs =
    options.retryIntervalMs ?? LOOPBACK_READINESS_LIMITS.defaultRetryIntervalMs;
  if (!boundedInteger(timeoutMs, LOOPBACK_READINESS_LIMITS.maxTimeoutMs)) {
    throw new TypeError("The readiness timeout is outside the trusted bounds.");
  }
  if (!boundedInteger(attemptTimeoutMs, LOOPBACK_READINESS_LIMITS.maxAttemptTimeoutMs)) {
    throw new TypeError("The readiness attempt timeout is outside the trusted bounds.");
  }
  if (!boundedInteger(retryIntervalMs, LOOPBACK_READINESS_LIMITS.maxRetryIntervalMs)) {
    throw new TypeError("The readiness retry interval is outside the trusted bounds.");
  }
  return Object.freeze({ attemptTimeoutMs, retryIntervalMs, timeoutMs });
}

function cancelledError(): LoopbackReadinessError {
  return new LoopbackReadinessError(
    LOOPBACK_READINESS_CODES.cancelled,
    "Loopback readiness was cancelled.",
  );
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function wait(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
  if (isAborted(signal)) {
    return Promise.reject(cancelledError());
  }
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: LoopbackReadinessError): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };
    const onAbort = (): void => finish(cancelledError());
    const timeout = setTimeout(() => finish(), delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function probe(origin: string, timeoutMs: number, signal: AbortSignal | undefined): Promise<void> {
  if (isAborted(signal)) {
    return Promise.reject(cancelledError());
  }
  const url = new URL("/", origin);
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (deadline !== undefined) {
        clearTimeout(deadline);
      }
      signal?.removeEventListener("abort", onAbort);
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };
    const onAbort = (): void => {
      client.destroy(cancelledError());
    };
    const client = request(
      url,
      {
        agent: false,
        headers: { connection: "close" },
        method: "HEAD",
      },
      (response) => {
        response.destroy();
        finish();
      },
    );
    client.once("error", finish);
    deadline = setTimeout(() => {
      client.destroy(new Error(`Readiness probe exceeded ${timeoutMs} ms.`));
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    client.end();
  });
}

export async function waitForLoopbackReady(
  originValue: string,
  options: LoopbackReadinessOptions = {},
): Promise<void> {
  const origin = normalizeLoopbackOrigin(originValue);
  const policy = readinessPolicy(options);
  const startedAt = performance.now();
  let lastError: string | undefined;

  while (true) {
    if (isAborted(options.signal)) {
      throw cancelledError();
    }
    const elapsed = performance.now() - startedAt;
    const remaining = policy.timeoutMs - elapsed;
    if (remaining <= 0) {
      throw new LoopbackReadinessError(
        LOOPBACK_READINESS_CODES.timeout,
        `Loopback origin did not respond within ${policy.timeoutMs} ms.`,
        lastError,
      );
    }

    try {
      await probe(origin, Math.min(policy.attemptTimeoutMs, remaining), options.signal);
      return;
    } catch (error) {
      if (isAborted(options.signal) || error instanceof LoopbackReadinessError) {
        throw cancelledError();
      }
      lastError = boundedErrorMessage(error);
    }

    const afterProbeRemaining = policy.timeoutMs - (performance.now() - startedAt);
    if (afterProbeRemaining <= 0) {
      continue;
    }
    await wait(Math.min(policy.retryIntervalMs, afterProbeRemaining), options.signal);
  }
}
