import {
  DRIVER_RESULT_LIMITS,
  type DriverStepResult,
  EXECUTION_VERDICTS,
  INTERPRETER_ERROR_CODES,
  runContract,
  type StepExecutionContext,
} from "@mergevow/interpreter";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createGuardedBrowserContext,
  createPlaywrightDriver,
  DRIVER_STEP_CODES,
  type GuardedBrowserContext,
  NETWORK_GUARD_CODES,
  NETWORK_TRANSPORT_FAILURE_CODE,
  PLAYWRIGHT_DRIVER_INFRA_CODES,
  PlaywrightDriverInfrastructureError,
  type PlaywrightInterpreterDriver,
} from "../src/index.js";
import { startTestLoopbackServer, type TestLoopbackServer } from "./loopback.js";

function stepContext(stepIndex = 0, signal = new AbortController().signal): StepExecutionContext {
  return Object.freeze({ signal, stepIndex });
}

function expectPass(result: DriverStepResult): void {
  expect(result).toEqual({ ok: true });
}

describe("real Playwright interpreter driver", () => {
  let allowed: TestLoopbackServer;
  let browser: Browser;
  let driver: PlaywrightInterpreterDriver;
  let external: TestLoopbackServer;
  let guarded: GuardedBrowserContext;
  let page: Page;

  beforeAll(async () => {
    external = await startTestLoopbackServer((_request, response) => response.end("external"));
    allowed = await startTestLoopbackServer((request, response) => {
      if (request.url === "/broken") {
        request.socket.destroy();
        return;
      }
      if (request.url === "/slow") {
        return;
      }
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`<!doctype html>
        <html>
          <body>
            <button onclick="document.querySelector('[data-testid=clicked]').textContent='clicked'">Action</button>
            <output data-testid="clicked">idle</output>
            <label>Name <input value="seed"></label>
            <label for="choice">Choice</label>
            <select id="choice"><option value="a">A</option><option value="b">B</option></select>
            <label>Toggle <input type="checkbox"></label>
            <button disabled>Disabled action</button>
            <div data-testid="hidden" hidden>Hidden target</div>
            <p data-testid="rendered-text">  Hello\n <span>world</span>  </p>
            <div data-testid="counted">One</div><div data-testid="counted">Two</div>
            <button>Duplicate</button><button>Duplicate</button>
            <a href="${external.origin}/blocked">External</a>
            <a href="/driver" target="_blank">New tab</a>
            <button onclick="window.open('/driver', '_blank')?.close()">Blinking tab</button>
          </body>
        </html>`);
    });
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  beforeEach(async () => {
    guarded = await createGuardedBrowserContext(browser, allowed.origin);
    page = await guarded.context.newPage();
    driver = createPlaywrightDriver({ guardedContext: guarded, page });
  });

  afterEach(async () => {
    await guarded.close();
  });

  afterAll(async () => {
    await browser.close();
    await Promise.all([allowed.close(), external.close()]);
  });

  it("executes all fourteen Contract V1 driver methods", async () => {
    expectPass(await driver.visit("/driver", stepContext(0)));
    expectPass(await driver.click({ name: "Action", role: "button" }, stepContext(1)));
    expect(await page.getByTestId("clicked").textContent()).toBe("clicked");

    expectPass(await driver.fill({ label: "Name" }, "Ada Lovelace", stepContext(2)));
    expectPass(await driver.assertValue({ label: "Name" }, "Ada Lovelace", stepContext(3)));
    expectPass(await driver.select({ label: "Choice" }, "b", stepContext(4)));
    expect(await page.getByLabel("Choice").inputValue()).toBe("b");
    expectPass(await driver.check({ label: "Toggle" }, stepContext(5)));
    expectPass(await driver.assertChecked({ label: "Toggle" }, true, stepContext(6)));
    expectPass(await driver.assertVisible({ name: "Action", role: "button" }, stepContext(7)));
    expectPass(await driver.assertHidden({ testId: "hidden" }, stepContext(8)));
    expectPass(await driver.assertUrl("/driver", stepContext(9)));
    expectPass(
      await driver.assertText({ testId: "rendered-text" }, " Hello   world ", stepContext(10)),
    );
    expectPass(await driver.assertCount({ testId: "counted" }, 2, stepContext(11)));
    expectPass(
      await driver.assertDisabled(
        { name: "Disabled action", role: "button" },
        true,
        stepContext(12),
      ),
    );
    expectPass(await driver.reload(stepContext(13)));
  }, 30_000);

  it("returns deterministic locator and assertion mismatches", async () => {
    await driver.visit("/driver", stepContext());

    expect(await driver.click({ name: "Missing", role: "button" }, stepContext())).toEqual({
      issue: {
        actual: 0,
        code: "LOCATOR_MISSING",
        expected: 1,
        message:
          '0 elements matched role "button" with accessible name "Missing"; expected exactly one.',
      },
      ok: false,
    });
    expect(await driver.click({ name: "Duplicate", role: "button" }, stepContext())).toEqual({
      issue: {
        actual: 2,
        code: "LOCATOR_AMBIGUOUS",
        expected: 1,
        message:
          '2 elements matched role "button" with accessible name "Duplicate"; expected exactly one.',
      },
      ok: false,
    });
    expect(await driver.assertText({ testId: "rendered-text" }, "Wrong", stepContext())).toEqual({
      issue: {
        actual: "Hello world",
        code: DRIVER_STEP_CODES.textMismatch,
        expected: "Wrong",
        message: 'Rendered text was "Hello world"; expected "Wrong".',
      },
      ok: false,
    });
    expect(await driver.assertCount({ testId: "counted" }, 1, stepContext())).toEqual({
      issue: {
        actual: 2,
        code: DRIVER_STEP_CODES.countMismatch,
        expected: 1,
        message: "Locator matched 2 elements; expected 1.",
      },
      ok: false,
    });
    expect(await driver.assertUrl("/wrong", stepContext())).toEqual({
      issue: {
        actual: "/driver",
        code: DRIVER_STEP_CODES.urlMismatch,
        expected: "/wrong",
        message: 'URL path was "/driver"; expected "/wrong".',
      },
      ok: false,
    });
  });

  it("compares the focused URL as pathname, search, and hash", async () => {
    expectPass(await driver.visit("/driver?mode=focus#task", stepContext()));
    expectPass(await driver.assertUrl("/driver?mode=focus#task", stepContext()));
  });

  it("bounds hostile observed strings without changing regression classification", async () => {
    await driver.visit("/driver", stepContext());
    await page.getByLabel("Name").fill("x".repeat(5_000));

    const result = await runContract(
      {
        flow: "bounded-observation",
        steps: [{ assertValue: { equals: "wrong", locator: { label: "Name" } } }],
        version: 1,
      },
      driver,
    );

    expect(result).toMatchObject({
      executionVerdict: EXECUTION_VERDICTS.regression,
      failure: { code: DRIVER_STEP_CODES.valueMismatch, stepIndex: 0 },
    });
    if (result.executionVerdict !== EXECUTION_VERDICTS.regression) {
      throw new Error("Expected a bounded semantic regression.");
    }
    expect(result.failure.actual).toHaveLength(DRIVER_RESULT_LIMITS.maxObservedStringLength);
    expect(result.failure.message.length).toBeLessThanOrEqual(
      DRIVER_RESULT_LIMITS.maxMessageLength,
    );
  });

  it("fails with retained policy state before and after operations", async () => {
    await driver.visit("/driver", stepContext());
    await page.goto("data:text/html,<h1>outside</h1>");

    const before = await driver
      .assertUrl("/driver", stepContext())
      .catch((reason: unknown) => reason);
    expect(before).toBeInstanceOf(PlaywrightDriverInfrastructureError);
    expect(before).toMatchObject({ code: NETWORK_GUARD_CODES.externalNavigation });

    await guarded.close();
    guarded = await createGuardedBrowserContext(browser, allowed.origin);
    page = await guarded.context.newPage();
    driver = createPlaywrightDriver({ guardedContext: guarded, page });
    await driver.visit("/driver", stepContext());
    external.requests.length = 0;

    const after = await driver
      .click({ name: "External", role: "link" }, stepContext())
      .catch((reason: unknown) => reason);
    expect(after).toBeInstanceOf(PlaywrightDriverInfrastructureError);
    expect(after).toMatchObject({ code: NETWORK_GUARD_CODES.externalNavigation });
    expect(external.requests).toEqual([]);
  });

  it("prioritizes retained transport failure over a Playwright navigation error", async () => {
    const result = await runContract(
      { flow: "transport-failure", steps: [{ visit: "/broken" }], version: 1 },
      driver,
    );

    expect(result).toMatchObject({
      completedSteps: 0,
      error: {
        code: INTERPRETER_ERROR_CODES.driverError,
        message: expect.stringContaining("Guarded transport failed"),
        stepIndex: 0,
      },
      executionVerdict: EXECUTION_VERDICTS.infraError,
    });
    expect(guarded.getTransportFailure()).toMatchObject({ code: NETWORK_TRANSPORT_FAILURE_CODE });
  });

  it("fails closed when an operation opens another page", async () => {
    await driver.visit("/driver", stepContext());

    const error = await driver
      .click({ name: "New tab", role: "link" }, stepContext())
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PlaywrightDriverInfrastructureError);
    expect(error).toMatchObject({
      code: PLAYWRIGHT_DRIVER_INFRA_CODES.unsupportedPageTopology,
      detail: { currentPages: 2, maximumObservedPages: 2 },
    });
  });

  it("retains truthful topology evidence after a popup immediately closes", async () => {
    await driver.visit("/driver", stepContext());

    const error = await driver
      .click({ name: "Blinking tab", role: "button" }, stepContext())
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PlaywrightDriverInfrastructureError);
    expect(error).toMatchObject({
      code: PLAYWRIGHT_DRIVER_INFRA_CODES.unsupportedPageTopology,
      detail: {
        currentPages: 1,
        maximumObservedPages: 2,
        message: "Expected one controlled page; observed up to 2 during replay (1 currently).",
      },
    });
    expect(guarded.context.pages()).toEqual([page]);
  });

  it("cooperates while the interpreter retains cancellation classification", async () => {
    const controller = new AbortController();
    const pending = runContract(
      { flow: "cancel-real-driver", steps: [{ visit: "/slow" }], version: 1 },
      driver,
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort("test cancellation"), 25);

    await expect(pending).resolves.toMatchObject({
      completedSteps: 0,
      error: { code: INTERPRETER_ERROR_CODES.cancelled, stepIndex: 0 },
      executionVerdict: EXECUTION_VERDICTS.infraError,
    });
    await expect.poll(() => page.isClosed()).toBe(true);
  });

  it("closes the page while the interpreter retains a real step timeout", async () => {
    const result = await runContract(
      { flow: "timeout-real-driver", steps: [{ visit: "/slow" }], version: 1 },
      driver,
      { policy: { stepTimeoutMs: 25, totalTimeoutMs: 1_000 } },
    );

    expect(result).toMatchObject({
      completedSteps: 0,
      error: { code: INTERPRETER_ERROR_CODES.stepTimeout, stepIndex: 0 },
      executionVerdict: EXECUTION_VERDICTS.infraError,
    });
    await expect.poll(() => page.isClosed()).toBe(true);
  });

  it("closes the controlled page when cancellation is already requested", async () => {
    const controller = new AbortController();
    controller.abort("test pre-cancellation");

    const error = await driver
      .visit("/driver", stepContext(0, controller.signal))
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(DOMException);
    expect(error).toMatchObject({ name: "AbortError" });
    expect(page.isClosed()).toBe(true);
  });
});
