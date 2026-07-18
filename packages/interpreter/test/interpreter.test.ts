import type { ContractStep, Locator } from "@mergevow/contract";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type DriverStepResult,
  EXECUTION_VERDICTS,
  INTERPRETER_ERROR_CODES,
  type InterpreterDriver,
  runContract,
  type StepExecutionContext,
} from "../src/index.js";

interface RecordedCall {
  readonly context: StepExecutionContext;
  readonly operation: keyof InterpreterDriver;
  readonly payload: unknown;
}

type DriverHandler = (call: RecordedCall) => DriverStepResult | Promise<DriverStepResult>;

const success = Object.freeze({ ok: true as const });

class RecordingDriver implements InterpreterDriver {
  readonly calls: RecordedCall[] = [];

  constructor(private readonly handler: DriverHandler = () => success) {}

  private async invoke(
    operation: keyof InterpreterDriver,
    payload: unknown,
    context: StepExecutionContext,
  ): Promise<DriverStepResult> {
    const call = { context, operation, payload };
    this.calls.push(call);
    return this.handler(call);
  }

  assertChecked(
    locator: Locator,
    equals: boolean,
    context: StepExecutionContext,
  ): Promise<DriverStepResult> {
    return this.invoke("assertChecked", { equals, locator }, context);
  }

  assertCount(
    locator: Locator,
    equals: number,
    context: StepExecutionContext,
  ): Promise<DriverStepResult> {
    return this.invoke("assertCount", { equals, locator }, context);
  }

  assertDisabled(
    locator: Locator,
    equals: boolean,
    context: StepExecutionContext,
  ): Promise<DriverStepResult> {
    return this.invoke("assertDisabled", { equals, locator }, context);
  }

  assertHidden(locator: Locator, context: StepExecutionContext): Promise<DriverStepResult> {
    return this.invoke("assertHidden", locator, context);
  }

  assertText(
    locator: Locator,
    equals: string,
    context: StepExecutionContext,
  ): Promise<DriverStepResult> {
    return this.invoke("assertText", { equals, locator }, context);
  }

  assertUrl(path: string, context: StepExecutionContext): Promise<DriverStepResult> {
    return this.invoke("assertUrl", path, context);
  }

  assertValue(
    locator: Locator,
    equals: string,
    context: StepExecutionContext,
  ): Promise<DriverStepResult> {
    return this.invoke("assertValue", { equals, locator }, context);
  }

  assertVisible(locator: Locator, context: StepExecutionContext): Promise<DriverStepResult> {
    return this.invoke("assertVisible", locator, context);
  }

  check(locator: Locator, context: StepExecutionContext): Promise<DriverStepResult> {
    return this.invoke("check", locator, context);
  }

  click(locator: Locator, context: StepExecutionContext): Promise<DriverStepResult> {
    return this.invoke("click", locator, context);
  }

  fill(locator: Locator, value: string, context: StepExecutionContext): Promise<DriverStepResult> {
    return this.invoke("fill", { locator, value }, context);
  }

  reload(context: StepExecutionContext): Promise<DriverStepResult> {
    return this.invoke("reload", null, context);
  }

  select(
    locator: Locator,
    value: string,
    context: StepExecutionContext,
  ): Promise<DriverStepResult> {
    return this.invoke("select", { locator, value }, context);
  }

  visit(path: string, context: StepExecutionContext): Promise<DriverStepResult> {
    return this.invoke("visit", path, context);
  }
}

const allOpcodeSteps = [
  { visit: "/form" },
  { click: { name: "Open", role: "button" } },
  { fill: { locator: { label: "Email" }, value: "dev@example.test" } },
  { select: { locator: { label: "Plan" }, value: "pro" } },
  { check: { label: "Terms" } },
  { reload: {} },
  { assertVisible: { name: "Ready", role: "heading" } },
  { assertHidden: { testId: "spinner" } },
  { assertUrl: "/form?ready=1" },
  { assertText: { equals: "Ready", locator: { testId: "status" } } },
  { assertValue: { equals: "pro", locator: { label: "Plan" } } },
  { assertCount: { equals: 2, locator: { testId: "item" } } },
  { assertChecked: { equals: true, locator: { label: "Terms" } } },
  { assertDisabled: { equals: false, locator: { name: "Submit", role: "button" } } },
] as const satisfies readonly ContractStep[];

const fullContract = {
  flow: "all-opcodes",
  steps: allOpcodeSteps,
  version: 1,
} as const;

afterEach(() => {
  vi.useRealTimers();
});

describe("deterministic interpreter state machine", () => {
  it("dispatches every Contract V1 opcode once and in source order", async () => {
    const driver = new RecordingDriver();

    const result = await runContract(fullContract, driver);

    expect(result).toEqual({
      completedSteps: 14,
      executionVerdict: EXECUTION_VERDICTS.pass,
      flow: "all-opcodes",
      totalSteps: 14,
    });
    expect(driver.calls.map((call) => call.operation)).toEqual([
      "visit",
      "click",
      "fill",
      "select",
      "check",
      "reload",
      "assertVisible",
      "assertHidden",
      "assertUrl",
      "assertText",
      "assertValue",
      "assertCount",
      "assertChecked",
      "assertDisabled",
    ]);
    expect(driver.calls.map((call) => call.context.stepIndex)).toEqual(
      Array.from({ length: 14 }, (_, index) => index),
    );
    expect(Object.keys(result)).not.toContain("durationMs");
    expect(Object.keys(result)).not.toContain("timestamp");
  });

  it("stops at the first semantic regression and returns the exact frozen step", async () => {
    const driver = new RecordingDriver((call) =>
      call.operation === "click"
        ? {
            issue: {
              actual: false,
              code: "LOCATOR_MISSING",
              expected: true,
              message: "The Open button was missing.",
            },
            ok: false,
          }
        : success,
    );

    const result = await runContract(fullContract, driver);

    expect(result).toEqual({
      completedSteps: 1,
      executionVerdict: EXECUTION_VERDICTS.regression,
      failure: {
        actual: false,
        code: "LOCATOR_MISSING",
        expected: true,
        message: "The Open button was missing.",
        step: { click: { name: "Open", role: "button" } },
        stepIndex: 1,
      },
      flow: "all-opcodes",
      totalSteps: 14,
    });
    expect(driver.calls).toHaveLength(2);
    if (result.executionVerdict === EXECUTION_VERDICTS.regression) {
      expect(Object.isFrozen(result.failure.step)).toBe(true);
      expect(Object.isFrozen(Object.values(result.failure.step)[0])).toBe(true);
    }
  });

  it("classifies driver exceptions without exposing a stack", async () => {
    const driver = new RecordingDriver(() => {
      throw new Error("Browser process exited.");
    });

    const result = await runContract(fullContract, driver);

    expect(result).toEqual({
      completedSteps: 0,
      error: {
        code: INTERPRETER_ERROR_CODES.driverError,
        message: "Browser process exited.",
        step: { visit: "/form" },
        stepIndex: 0,
      },
      executionVerdict: EXECUTION_VERDICTS.infraError,
      flow: "all-opcodes",
      totalSteps: 14,
    });
  });

  it("snapshots a Proxy-backed driver error message before bounding it", async () => {
    let messageReads = 0;
    const poison = new Proxy(
      { length: 1 },
      {
        ownKeys() {
          throw new Error("Escaped error-message Proxy.");
        },
      },
    );
    const error = new Proxy(new Error("Browser process exited."), {
      get(target, property, receiver) {
        if (property === "message") {
          messageReads += 1;
          return messageReads === 1 ? "Browser process exited." : poison;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const driver = new RecordingDriver(() => {
      throw error;
    });

    const result = await runContract(fullContract, driver);

    expect(result.executionVerdict).toBe(EXECUTION_VERDICTS.infraError);
    if (result.executionVerdict === EXECUTION_VERDICTS.infraError) {
      expect(result.error.code).toBe(INTERPRETER_ERROR_CODES.driverError);
      expect(result.error.message).toBe("Browser process exited.");
    }
    expect(messageReads).toBe(1);
  });

  it("rejects malformed driver results as protocol errors", async () => {
    const driver = new RecordingDriver(() => undefined as unknown as DriverStepResult);
    const inherited = new RecordingDriver(() => Object.create({ ok: true }) as DriverStepResult);
    const extra = new RecordingDriver(
      () => ({ debugCallback() {}, ok: true }) as unknown as DriverStepResult,
    );

    const result = await runContract(fullContract, driver);
    const inheritedResult = await runContract(fullContract, inherited);
    const extraResult = await runContract(fullContract, extra);

    expect(result.executionVerdict).toBe(EXECUTION_VERDICTS.infraError);
    expect(inheritedResult.executionVerdict).toBe(EXECUTION_VERDICTS.infraError);
    expect(extraResult.executionVerdict).toBe(EXECUTION_VERDICTS.infraError);
    if (result.executionVerdict === EXECUTION_VERDICTS.infraError) {
      expect(result.error.code).toBe(INTERPRETER_ERROR_CODES.driverProtocolError);
      expect(result.error.stepIndex).toBe(0);
    }
    if (inheritedResult.executionVerdict === EXECUTION_VERDICTS.infraError) {
      expect(inheritedResult.error.code).toBe(INTERPRETER_ERROR_CODES.driverProtocolError);
    }
    if (extraResult.executionVerdict === EXECUTION_VERDICTS.infraError) {
      expect(extraResult.error.code).toBe(INTERPRETER_ERROR_CODES.driverProtocolError);
    }
  });

  it("snapshots Proxy-backed driver issues before validating bounded fields", async () => {
    let codeReads = 0;
    const issue = new Proxy(
      {
        code: "LOCATOR_MISSING",
        message: "The target was missing.",
      },
      {
        get(target, property, receiver) {
          if (property === "code") {
            codeReads += 1;
            return codeReads <= 3 ? target.code : "X".repeat(100_000);
          }
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const driver = new RecordingDriver(() => ({ issue, ok: false }));

    const result = await runContract(fullContract, driver);

    expect(result.executionVerdict).toBe(EXECUTION_VERDICTS.regression);
    if (result.executionVerdict === EXECUTION_VERDICTS.regression) {
      expect(result.failure.code).toBe("LOCATOR_MISSING");
      expect(result.failure.message).toBe("The target was missing.");
    }
    expect(codeReads).toBe(0);
  });

  it("aborts and identifies the exact step when its timeout expires", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const driver = new RecordingDriver(
      (call) =>
        new Promise<DriverStepResult>(() => {
          observedSignal = call.context.signal;
        }),
    );

    const pending = runContract(fullContract, driver, {
      policy: { stepTimeoutMs: 10, totalTimeoutMs: 100 },
    });
    await vi.advanceTimersByTimeAsync(10);
    const result = await pending;

    expect(result.executionVerdict).toBe(EXECUTION_VERDICTS.infraError);
    if (result.executionVerdict === EXECUTION_VERDICTS.infraError) {
      expect(result.error).toEqual({
        code: INTERPRETER_ERROR_CODES.stepTimeout,
        message: "Step 0 exceeded the 10 ms timeout.",
        step: { visit: "/form" },
        stepIndex: 0,
      });
    }
    expect(observedSignal?.aborted).toBe(true);
    expect(driver.calls).toHaveLength(1);
  });

  it("applies the total timeout across multiple steps", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const driver = new RecordingDriver((call) => {
      calls += 1;
      if (calls === 1) {
        return new Promise<DriverStepResult>((resolve) => {
          setTimeout(() => resolve(success), 6);
        });
      }
      return new Promise<DriverStepResult>((_resolve, reject) => {
        expect(call.context.stepIndex).toBe(1);
        call.context.signal.addEventListener(
          "abort",
          () => reject(new Error("Driver observed total-timeout abort.")),
          { once: true },
        );
      });
    });

    const pending = runContract(fullContract, driver, {
      policy: { stepTimeoutMs: 50, totalTimeoutMs: 10 },
    });
    await vi.advanceTimersByTimeAsync(10);
    const result = await pending;

    expect(result.executionVerdict).toBe(EXECUTION_VERDICTS.infraError);
    if (result.executionVerdict === EXECUTION_VERDICTS.infraError) {
      expect(result.completedSteps).toBe(1);
      expect(result.error.code).toBe(INTERPRETER_ERROR_CODES.totalTimeout);
      expect(result.error.stepIndex).toBe(1);
      expect(result.error.step).toEqual({ click: { name: "Open", role: "button" } });
    }
  });

  it("returns cancellation before replay without invoking the driver", async () => {
    const controller = new AbortController();
    controller.abort();
    const driver = new RecordingDriver();

    const result = await runContract(fullContract, driver, { signal: controller.signal });

    expect(result).toEqual({
      completedSteps: 0,
      error: {
        code: INTERPRETER_ERROR_CODES.cancelled,
        message: "Replay was cancelled before the first step.",
      },
      executionVerdict: EXECUTION_VERDICTS.infraError,
      flow: "all-opcodes",
      totalSteps: 14,
    });
    expect(driver.calls).toHaveLength(0);
  });

  it("propagates cancellation to the active driver call", async () => {
    const controller = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const driver = new RecordingDriver(
      (call) =>
        new Promise<DriverStepResult>(() => {
          observedSignal = call.context.signal;
        }),
    );

    const pending = runContract(fullContract, driver, { signal: controller.signal });
    controller.abort();
    const result = await pending;

    expect(result.executionVerdict).toBe(EXECUTION_VERDICTS.infraError);
    if (result.executionVerdict === EXECUTION_VERDICTS.infraError) {
      expect(result.error.code).toBe(INTERPRETER_ERROR_CODES.cancelled);
      expect(result.error.stepIndex).toBe(0);
    }
    expect(observedSignal?.aborted).toBe(true);
  });

  it("prioritizes cancellation when the active driver settles after abort", async () => {
    const controller = new AbortController();
    const driver = new RecordingDriver(() => {
      controller.abort();
      return success;
    });

    const result = await runContract(fullContract, driver, { signal: controller.signal });

    expect(result.executionVerdict).toBe(EXECUTION_VERDICTS.infraError);
    if (result.executionVerdict === EXECUTION_VERDICTS.infraError) {
      expect(result.completedSteps).toBe(0);
      expect(result.error.code).toBe(INTERPRETER_ERROR_CODES.cancelled);
      expect(result.error.stepIndex).toBe(0);
    }
    expect(driver.calls).toHaveLength(1);
  });

  it("snapshots Proxy-backed policy values before validation and execution", async () => {
    let timeoutReads = 0;
    const policy = new Proxy(
      { stepTimeoutMs: 50, totalTimeoutMs: 100 },
      {
        get(target, property, receiver) {
          if (property === "stepTimeoutMs" || property === "totalTimeoutMs") {
            timeoutReads += 1;
            return timeoutReads <= 2 ? Reflect.get(target, property, receiver) : 1n;
          }
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const driver = new RecordingDriver();

    const result = await runContract(fullContract, driver, { policy });

    expect(result.executionVerdict).toBe(EXECUTION_VERDICTS.pass);
    expect(timeoutReads).toBe(0);
  });

  it("rejects invalid contracts and timeout policy before driver execution", async () => {
    const driver = new RecordingDriver();

    const invalidContract = await runContract({ flow: "invalid", steps: [], version: 1 }, driver);
    const invalidPolicy = await runContract(fullContract, driver, {
      policy: { stepTimeoutMs: 0, totalTimeoutMs: 10 },
    });
    const inheritedPolicy = await runContract(fullContract, driver, {
      policy: Object.create({ stepTimeoutMs: 10, totalTimeoutMs: 20 }) as {
        stepTimeoutMs: number;
        totalTimeoutMs: number;
      },
    });
    const extraPolicy = await runContract(fullContract, driver, {
      policy: {
        retry: 1,
        stepTimeoutMs: 10,
        totalTimeoutMs: 20,
      } as unknown as { stepTimeoutMs: number; totalTimeoutMs: number },
    });

    expect(invalidContract.executionVerdict).toBe(EXECUTION_VERDICTS.infraError);
    expect(invalidPolicy.executionVerdict).toBe(EXECUTION_VERDICTS.infraError);
    expect(inheritedPolicy.executionVerdict).toBe(EXECUTION_VERDICTS.infraError);
    expect(extraPolicy.executionVerdict).toBe(EXECUTION_VERDICTS.infraError);
    if (invalidContract.executionVerdict === EXECUTION_VERDICTS.infraError) {
      expect(invalidContract.error.code).toBe(INTERPRETER_ERROR_CODES.invalidContract);
      expect(invalidContract.error.contractIssues?.length).toBeGreaterThan(0);
    }
    if (invalidPolicy.executionVerdict === EXECUTION_VERDICTS.infraError) {
      expect(invalidPolicy.error.code).toBe(INTERPRETER_ERROR_CODES.invalidPolicy);
    }
    if (inheritedPolicy.executionVerdict === EXECUTION_VERDICTS.infraError) {
      expect(inheritedPolicy.error.code).toBe(INTERPRETER_ERROR_CODES.invalidPolicy);
    }
    if (extraPolicy.executionVerdict === EXECUTION_VERDICTS.infraError) {
      expect(extraPolicy.error.code).toBe(INTERPRETER_ERROR_CODES.invalidPolicy);
    }
    expect(driver.calls).toHaveLength(0);
  });

  it("dispatches only the step's own opcode under prototype pollution", async () => {
    const original = Object.getOwnPropertyDescriptor(Object.prototype, "visit");
    const driver = new RecordingDriver();
    let result: Awaited<ReturnType<typeof runContract>>;

    try {
      Object.defineProperty(Object.prototype, "visit", {
        configurable: true,
        value: "/forged",
      });
      result = await runContract(
        {
          flow: "own-opcode",
          steps: [{ click: { name: "Continue", role: "button" } }],
          version: 1,
        },
        driver,
      );
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(Object.prototype, "visit");
      } else {
        Object.defineProperty(Object.prototype, "visit", original);
      }
    }

    expect(result.executionVerdict).toBe(EXECUTION_VERDICTS.pass);
    expect(driver.calls.map((call) => call.operation)).toEqual(["click"]);
  });
});
