import { EXECUTION_VERDICTS, type InterpreterRunResult } from "@mergevow/interpreter";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TODO_PERSISTENCE_CONTRACT } from "../src/contract.js";
import { replayTodoVariant } from "../src/replay.js";
import { formatLocalRunSummary } from "../src/summary.js";

describe("todo persistence vertical slice", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  afterAll(async () => {
    await browser.close();
  });

  it("passes one unchanged contract across the semantic refactor", async () => {
    const baseline = await replayTodoVariant(browser, "baseline");
    const refactored = await replayTodoVariant(browser, "semantic-refactor");

    expect(baseline).toEqual({
      completedSteps: TODO_PERSISTENCE_CONTRACT.steps.length,
      executionVerdict: EXECUTION_VERDICTS.pass,
      flow: TODO_PERSISTENCE_CONTRACT.flow,
      totalSteps: TODO_PERSISTENCE_CONTRACT.steps.length,
    });
    expect(refactored).toEqual(baseline);
    expect(formatLocalRunSummary(refactored)).toBe(
      'MergeVow Local Cooperative\nflow: "todo-persistence"\nverdict: PASS\nsteps: 7/7\n',
    );
  }, 30_000);

  it("fails only at the final post-reload persistence checkpoint", async () => {
    const result = await replayTodoVariant(browser, "broken-persistence");

    expect(result).toMatchObject({
      completedSteps: 6,
      executionVerdict: EXECUTION_VERDICTS.regression,
      failure: {
        actual: 0,
        code: "LOCATOR_MISSING",
        expected: 1,
        step: TODO_PERSISTENCE_CONTRACT.steps[6],
        stepIndex: 6,
      },
      flow: TODO_PERSISTENCE_CONTRACT.flow,
      totalSteps: 7,
    });
    expect(formatLocalRunSummary(result)).toBe(
      'MergeVow Local Cooperative\nflow: "todo-persistence"\nverdict: REGRESSION\nsteps: 6/7\n' +
        'failure.step: 6\nfailure.code: "LOCATOR_MISSING"\n' +
        'failure.message: "0 elements matched role \\"listitem\\" with accessible name \\"Ship release\\"; expected exactly one."\n' +
        "failure.expected: 1\nfailure.actual: 0\n",
    );
  }, 30_000);

  it("quotes control characters in dynamic terminal fields", () => {
    const synthetic = {
      completedSteps: 0,
      error: {
        code: "DRIVER_ERROR",
        message: "unsafe\u001b[31m\u009bmessage\u2028continued",
      },
      executionVerdict: EXECUTION_VERDICTS.infraError,
      flow: "flow\u001b[2J\u009dtitle\u202espoof",
      totalSteps: 1,
    } as const satisfies InterpreterRunResult;

    const summary = formatLocalRunSummary(synthetic);
    expect(summary).not.toContain("\u001b");
    expect(summary).not.toContain("\u009b");
    expect(summary).not.toContain("\u009d");
    expect(summary).not.toContain("\u2028");
    expect(summary).not.toContain("\u202e");
    expect(summary).toContain("\\u001b[31m");
    expect(summary).toContain("\\u001b[2J");
    expect(summary).toContain("\\u009bmessage");
    expect(summary).toContain("\\u009dtitle");
    expect(summary).toContain("\\u2028continued");
    expect(summary).toContain("\\u202espoof");
  });
});
