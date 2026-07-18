import { EXECUTION_VERDICTS } from "@mergevow/interpreter";
import { chromium } from "playwright";

import { replayTodoVariant } from "./replay.js";
import { formatLocalRunSummary } from "./summary.js";

const browser = await chromium.launch({ headless: true });
try {
  for (const variant of ["baseline", "semantic-refactor", "broken-persistence"] as const) {
    const result = await replayTodoVariant(browser, variant);
    process.stdout.write(`variant: ${variant}\n${formatLocalRunSummary(result)}\n`);
    const expected =
      variant === "broken-persistence" ? EXECUTION_VERDICTS.regression : EXECUTION_VERDICTS.pass;
    if (result.executionVerdict !== expected) {
      throw new Error(
        `Variant ${variant} produced ${result.executionVerdict}; expected ${expected}.`,
      );
    }
  }
} finally {
  await browser.close();
}
