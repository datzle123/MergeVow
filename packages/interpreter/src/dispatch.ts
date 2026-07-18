import type { ContractOpcode, ContractStep } from "@mergevow/contract";

import type { DriverStepResult, InterpreterDriver, StepExecutionContext } from "./types.js";

type StepFor<TOpcode extends ContractOpcode> = Extract<ContractStep, Record<TOpcode, unknown>>;

export async function dispatchStep(
  driver: InterpreterDriver,
  step: ContractStep,
  context: StepExecutionContext,
): Promise<DriverStepResult> {
  const opcode = Object.keys(step)[0] as ContractOpcode | undefined;

  switch (opcode) {
    case "visit":
      return driver.visit((step as StepFor<"visit">).visit, context);
    case "click":
      return driver.click((step as StepFor<"click">).click, context);
    case "fill": {
      const payload = (step as StepFor<"fill">).fill;
      return driver.fill(payload.locator, payload.value, context);
    }
    case "select": {
      const payload = (step as StepFor<"select">).select;
      return driver.select(payload.locator, payload.value, context);
    }
    case "check":
      return driver.check((step as StepFor<"check">).check, context);
    case "reload":
      return driver.reload(context);
    case "assertVisible":
      return driver.assertVisible((step as StepFor<"assertVisible">).assertVisible, context);
    case "assertHidden":
      return driver.assertHidden((step as StepFor<"assertHidden">).assertHidden, context);
    case "assertUrl":
      return driver.assertUrl((step as StepFor<"assertUrl">).assertUrl, context);
    case "assertText": {
      const payload = (step as StepFor<"assertText">).assertText;
      return driver.assertText(payload.locator, payload.equals, context);
    }
    case "assertValue": {
      const payload = (step as StepFor<"assertValue">).assertValue;
      return driver.assertValue(payload.locator, payload.equals, context);
    }
    case "assertCount": {
      const payload = (step as StepFor<"assertCount">).assertCount;
      return driver.assertCount(payload.locator, payload.equals, context);
    }
    case "assertChecked": {
      const payload = (step as StepFor<"assertChecked">).assertChecked;
      return driver.assertChecked(payload.locator, payload.equals, context);
    }
    case "assertDisabled": {
      const payload = (step as StepFor<"assertDisabled">).assertDisabled;
      return driver.assertDisabled(payload.locator, payload.equals, context);
    }
    default:
      throw new TypeError("Validated contract contained an unsupported opcode.");
  }
}
