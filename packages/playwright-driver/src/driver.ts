import type { Locator as ContractLocator } from "@mergevow/contract";
import {
  DRIVER_RESULT_LIMITS,
  type DriverObservedValue,
  type DriverStepResult,
  type InterpreterDriver,
  type StepExecutionContext,
} from "@mergevow/interpreter";
import type { Page, Locator as PlaywrightLocator } from "playwright";

import { inspectLocatorMatches, resolveUniqueLocator } from "./locator.js";
import type {
  GuardedBrowserContext,
  NetworkGuardViolation,
  NetworkTransportFailure,
} from "./network.js";

export const DRIVER_STEP_CODES = {
  checkedMismatch: "CHECKED_MISMATCH",
  countMismatch: "COUNT_MISMATCH",
  disabledMismatch: "DISABLED_MISMATCH",
  hiddenMismatch: "HIDDEN_MISMATCH",
  textMismatch: "TEXT_MISMATCH",
  urlMismatch: "URL_MISMATCH",
  valueMismatch: "VALUE_MISMATCH",
  visibleMismatch: "VISIBLE_MISMATCH",
} as const;

export const PLAYWRIGHT_DRIVER_INFRA_CODES = {
  unsupportedPageTopology: "UNSUPPORTED_PAGE_TOPOLOGY",
} as const;

export type DriverStepCode = (typeof DRIVER_STEP_CODES)[keyof typeof DRIVER_STEP_CODES];
export interface PageTopologyFailure {
  readonly code: typeof PLAYWRIGHT_DRIVER_INFRA_CODES.unsupportedPageTopology;
  readonly currentPages: number;
  readonly maximumObservedPages: number;
  readonly message: string;
}

export type PlaywrightDriverInfrastructureDetail =
  | NetworkGuardViolation
  | NetworkTransportFailure
  | PageTopologyFailure;

export class PlaywrightDriverInfrastructureError extends Error {
  readonly code: PlaywrightDriverInfrastructureDetail["code"];
  readonly detail: PlaywrightDriverInfrastructureDetail;

  constructor(detail: PlaywrightDriverInfrastructureDetail) {
    super(detail.message);
    this.name = "PlaywrightDriverInfrastructureError";
    this.code = detail.code;
    this.detail = detail;
  }
}

export interface PlaywrightDriverOptions {
  readonly guardedContext: GuardedBrowserContext;
  readonly page: Page;
}

export type PlaywrightInterpreterDriver = InterpreterDriver;

const PASS_RESULT: DriverStepResult = Object.freeze({ ok: true });
const POST_OPERATION_OBSERVATION_MS = 50;

function boundedString(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 3)}...`;
}

function mismatch(
  code: DriverStepCode,
  message: string,
  expected: DriverObservedValue,
  actual: DriverObservedValue,
): DriverStepResult {
  const boundedExpected =
    typeof expected === "string"
      ? boundedString(expected, DRIVER_RESULT_LIMITS.maxObservedStringLength)
      : expected;
  const boundedActual =
    typeof actual === "string"
      ? boundedString(actual, DRIVER_RESULT_LIMITS.maxObservedStringLength)
      : actual;
  return Object.freeze({
    issue: Object.freeze({
      actual: boundedActual,
      code,
      expected: boundedExpected,
      message: boundedString(message, DRIVER_RESULT_LIMITS.maxMessageLength),
    }),
    ok: false,
  });
}

function locatorMismatch(
  result: Extract<Awaited<ReturnType<typeof resolveUniqueLocator>>, { ok: false }>,
): DriverStepResult {
  const issue = result.issues[0];
  if (issue === undefined) {
    throw new TypeError("Locator resolution failed without an issue.");
  }
  return Object.freeze({
    issue: Object.freeze({
      actual: issue.matchCount,
      code: issue.code,
      expected: 1,
      message: issue.message,
    }),
    ok: false,
  });
}

function infrastructureError(
  options: PlaywrightDriverOptions,
  maximumObservedPages: number,
): PlaywrightDriverInfrastructureError | undefined {
  const violation = options.guardedContext.getViolation();
  if (violation !== undefined) {
    return new PlaywrightDriverInfrastructureError(violation);
  }
  const transportFailure = options.guardedContext.getTransportFailure();
  if (transportFailure !== undefined) {
    return new PlaywrightDriverInfrastructureError(transportFailure);
  }
  const pages = options.guardedContext.context.pages();
  if (maximumObservedPages > 1 || pages.length !== 1 || pages[0] !== options.page) {
    const message =
      maximumObservedPages > 1
        ? `Expected one controlled page; observed up to ${maximumObservedPages} during replay (${pages.length} currently).`
        : `Expected one controlled page; observed ${pages.length} currently.`;
    return new PlaywrightDriverInfrastructureError(
      Object.freeze({
        code: PLAYWRIGHT_DRIVER_INFRA_CODES.unsupportedPageTopology,
        currentPages: pages.length,
        maximumObservedPages,
        message,
      }),
    );
  }
  return undefined;
}

function assertInfrastructureHealthy(
  options: PlaywrightDriverOptions,
  maximumObservedPages: number,
): void {
  const error = infrastructureError(options, maximumObservedPages);
  if (error !== undefined) {
    throw error;
  }
}

function cancellationError(): DOMException {
  return new DOMException("Playwright driver operation was cancelled.", "AbortError");
}

function observeImmediateBrowserEvents(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, POST_OPERATION_OBSERVATION_MS));
}

async function runOperation<T>(
  options: PlaywrightDriverOptions,
  getMaximumObservedPages: () => number,
  context: StepExecutionContext,
  operation: () => Promise<T>,
): Promise<T> {
  assertInfrastructureHealthy(options, getMaximumObservedPages());
  if (context.signal.aborted) {
    await options.page.close().catch(() => undefined);
    throw cancellationError();
  }

  let onAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      const error = cancellationError();
      void options.page.close().then(
        () => reject(error),
        () => reject(error),
      );
    };
    context.signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    const value = await Promise.race([Promise.resolve().then(operation), cancelled]);
    await observeImmediateBrowserEvents();
    assertInfrastructureHealthy(options, getMaximumObservedPages());
    return value;
  } catch (error) {
    await observeImmediateBrowserEvents();
    assertInfrastructureHealthy(options, getMaximumObservedPages());
    throw error;
  } finally {
    if (onAbort !== undefined) {
      context.signal.removeEventListener("abort", onAbort);
    }
  }
}

async function withUniqueLocator(
  options: PlaywrightDriverOptions,
  getMaximumObservedPages: () => number,
  locator: ContractLocator,
  context: StepExecutionContext,
  operation: (locator: PlaywrightLocator) => Promise<DriverStepResult>,
  includeHidden = false,
): Promise<DriverStepResult> {
  return runOperation(options, getMaximumObservedPages, context, async () => {
    const resolution = await resolveUniqueLocator(options.page, locator, { includeHidden });
    return resolution.ok ? operation(resolution.value.locator) : locatorMismatch(resolution);
  });
}

function normalizeRenderedText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function urlPath(page: Page): string {
  const current = new URL(page.url());
  return `${current.pathname}${current.search}${current.hash}`;
}

export function createPlaywrightDriver(
  options: PlaywrightDriverOptions,
): PlaywrightInterpreterDriver {
  if (options.page.context() !== options.guardedContext.context) {
    throw new TypeError("The controlled page must belong to the guarded browser context.");
  }
  const initialPages = options.guardedContext.context.pages();
  let maximumObservedPages = initialPages.some((page) => page !== options.page)
    ? Math.max(2, initialPages.length)
    : initialPages.length;
  options.guardedContext.context.on("page", (page) => {
    if (page !== options.page) {
      maximumObservedPages = Math.max(
        2,
        maximumObservedPages,
        options.guardedContext.context.pages().length,
      );
    }
  });
  const getMaximumObservedPages = (): number => maximumObservedPages;

  const driver: PlaywrightInterpreterDriver = {
    assertChecked: (locator, equals, context) =>
      withUniqueLocator(options, getMaximumObservedPages, locator, context, async (resolved) => {
        const actual = await resolved.isChecked();
        return actual === equals
          ? PASS_RESULT
          : mismatch(
              DRIVER_STEP_CODES.checkedMismatch,
              `Checked state was ${actual}; expected ${equals}.`,
              equals,
              actual,
            );
      }),
    assertCount: (locator, equals, context) =>
      runOperation(options, getMaximumObservedPages, context, async () => {
        const actual = (await inspectLocatorMatches(options.page, locator)).matchCount;
        return actual === equals
          ? PASS_RESULT
          : mismatch(
              DRIVER_STEP_CODES.countMismatch,
              `Locator matched ${actual} elements; expected ${equals}.`,
              equals,
              actual,
            );
      }),
    assertDisabled: (locator, equals, context) =>
      withUniqueLocator(options, getMaximumObservedPages, locator, context, async (resolved) => {
        const actual = await resolved.isDisabled();
        return actual === equals
          ? PASS_RESULT
          : mismatch(
              DRIVER_STEP_CODES.disabledMismatch,
              `Disabled state was ${actual}; expected ${equals}.`,
              equals,
              actual,
            );
      }),
    assertHidden: (locator, context) =>
      withUniqueLocator(
        options,
        getMaximumObservedPages,
        locator,
        context,
        async (resolved) => {
          const actual = await resolved.isHidden();
          return actual
            ? PASS_RESULT
            : mismatch(
                DRIVER_STEP_CODES.hiddenMismatch,
                "Element was visible; expected it to be hidden.",
                true,
                actual,
              );
        },
        true,
      ),
    assertText: (locator, equals, context) =>
      withUniqueLocator(options, getMaximumObservedPages, locator, context, async (resolved) => {
        const actual = normalizeRenderedText(await resolved.innerText());
        const expected = normalizeRenderedText(equals);
        return actual === expected
          ? PASS_RESULT
          : mismatch(
              DRIVER_STEP_CODES.textMismatch,
              `Rendered text was ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}.`,
              expected,
              actual,
            );
      }),
    assertUrl: (path, context) =>
      runOperation(options, getMaximumObservedPages, context, async () => {
        const actual = urlPath(options.page);
        return actual === path
          ? PASS_RESULT
          : mismatch(
              DRIVER_STEP_CODES.urlMismatch,
              `URL path was ${JSON.stringify(actual)}; expected ${JSON.stringify(path)}.`,
              path,
              actual,
            );
      }),
    assertValue: (locator, equals, context) =>
      withUniqueLocator(options, getMaximumObservedPages, locator, context, async (resolved) => {
        const actual = await resolved.inputValue();
        return actual === equals
          ? PASS_RESULT
          : mismatch(
              DRIVER_STEP_CODES.valueMismatch,
              `Control value was ${JSON.stringify(actual)}; expected ${JSON.stringify(equals)}.`,
              equals,
              actual,
            );
      }),
    assertVisible: (locator, context) =>
      withUniqueLocator(options, getMaximumObservedPages, locator, context, async (resolved) => {
        const actual = await resolved.isVisible();
        return actual
          ? PASS_RESULT
          : mismatch(
              DRIVER_STEP_CODES.visibleMismatch,
              "Element was hidden; expected it to be visible.",
              true,
              actual,
            );
      }),
    check: (locator, context) =>
      withUniqueLocator(options, getMaximumObservedPages, locator, context, async (resolved) => {
        await resolved.check();
        return PASS_RESULT;
      }),
    click: (locator, context) =>
      withUniqueLocator(options, getMaximumObservedPages, locator, context, async (resolved) => {
        await resolved.click();
        return PASS_RESULT;
      }),
    fill: (locator, value, context) =>
      withUniqueLocator(options, getMaximumObservedPages, locator, context, async (resolved) => {
        await resolved.fill(value);
        return PASS_RESULT;
      }),
    reload: (context) =>
      runOperation(options, getMaximumObservedPages, context, async () => {
        await options.page.reload({ waitUntil: "load" });
        return PASS_RESULT;
      }),
    select: (locator, value, context) =>
      withUniqueLocator(options, getMaximumObservedPages, locator, context, async (resolved) => {
        await resolved.selectOption({ value });
        return PASS_RESULT;
      }),
    visit: (path, context) =>
      runOperation(options, getMaximumObservedPages, context, async () => {
        await options.page.goto(path, { waitUntil: "load" });
        return PASS_RESULT;
      }),
  };

  return Object.freeze(driver);
}
