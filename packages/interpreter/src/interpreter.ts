import { type ContractStep, validateContract } from "@mergevow/contract";

import { dispatchStep } from "./dispatch.js";
import {
  DEFAULT_INTERPRETER_POLICY,
  type DriverObservedValue,
  type DriverStepIssue,
  EXECUTION_VERDICTS,
  INTERPRETER_ERROR_CODES,
  INTERPRETER_POLICY_LIMITS,
  type InterpreterDriver,
  type InterpreterError,
  type InterpreterPolicy,
  type InterpreterRunResult,
  type RunContractOptions,
} from "./types.js";

const MAX_DRIVER_CODE_LENGTH = 128;
const MAX_DRIVER_MESSAGE_LENGTH = 4_096;

type RaceOutcome =
  | { readonly kind: "cancelled" }
  | { readonly error: unknown; readonly kind: "driver-error" }
  | { readonly kind: "driver-result"; readonly value: unknown }
  | { readonly kind: "step-timeout" }
  | { readonly kind: "total-timeout" };

interface OutcomeSource<TOutcome> {
  readonly dispose: () => void;
  readonly promise: Promise<TOutcome>;
  readonly signal?: AbortSignal;
}

function freezeTree<T>(root: T): T {
  const pending: unknown[] = [root];
  const seen = new Set<object>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== "object" || seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const value of Object.values(current)) {
      pending.push(value);
    }
    Object.freeze(current);
  }

  return root;
}

function isTimeoutValue(value: unknown, maximum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= INTERPRETER_POLICY_LIMITS.minTimeoutMs &&
    value <= maximum
  );
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function normalizePolicy(value: InterpreterPolicy | undefined): InterpreterPolicy | undefined {
  if (value === undefined) {
    return DEFAULT_INTERPRETER_POLICY;
  }
  const policy = snapshotClosedData(value, ["stepTimeoutMs", "totalTimeoutMs"]);
  if (policy === undefined) {
    return undefined;
  }
  const stepTimeoutMs = policy.stepTimeoutMs;
  const totalTimeoutMs = policy.totalTimeoutMs;
  if (
    !isTimeoutValue(stepTimeoutMs, INTERPRETER_POLICY_LIMITS.maxStepTimeoutMs) ||
    !isTimeoutValue(totalTimeoutMs, INTERPRETER_POLICY_LIMITS.maxTotalTimeoutMs)
  ) {
    return undefined;
  }
  return Object.freeze({ stepTimeoutMs, totalTimeoutMs });
}

function neverOutcome<TOutcome>(): OutcomeSource<TOutcome> {
  return {
    dispose() {},
    promise: new Promise<TOutcome>(() => {}),
  };
}

function cancellationOutcome(
  signal: AbortSignal | undefined,
): OutcomeSource<{ kind: "cancelled" }> {
  if (signal === undefined) {
    return neverOutcome();
  }
  if (signal.aborted) {
    return { dispose() {}, promise: Promise.resolve({ kind: "cancelled" }) };
  }

  let listener: (() => void) | undefined;
  const promise = new Promise<{ kind: "cancelled" }>((resolve) => {
    listener = () => resolve({ kind: "cancelled" });
    signal.addEventListener("abort", listener, { once: true });
  });
  return {
    dispose() {
      if (listener !== undefined) {
        signal.removeEventListener("abort", listener);
      }
    },
    promise,
    signal,
  };
}

function timeoutOutcome<TKind extends "step-timeout" | "total-timeout">(
  timeoutMs: number,
  kind: TKind,
): OutcomeSource<{ kind: TKind }> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<{ kind: TKind }>((resolve) => {
    timeout = setTimeout(() => {
      resolve({ kind });
      controller.abort(kind);
    }, timeoutMs);
  });
  return {
    dispose() {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    },
    promise,
    signal: controller.signal,
  };
}

function boundedErrorMessage(error: unknown): string {
  try {
    const candidate = error instanceof Error ? error.message : undefined;
    const message = typeof candidate === "string" ? candidate : "Driver threw a non-Error value.";
    return message.length <= MAX_DRIVER_MESSAGE_LENGTH
      ? message
      : `${message.slice(0, MAX_DRIVER_MESSAGE_LENGTH - 3)}...`;
  } catch {
    return "Driver threw an error whose message could not be read.";
  }
}

function isObservedValue(value: unknown): value is DriverObservedValue {
  return (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length <= MAX_DRIVER_MESSAGE_LENGTH)
  );
}

function snapshotClosedData(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) {
      return undefined;
    }
    const names = ownKeys as string[];
    const allowed = new Set([...requiredKeys, ...optionalKeys]);
    if (
      !requiredKeys.every((key) => names.includes(key)) ||
      !names.every((name) => allowed.has(name))
    ) {
      return undefined;
    }

    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const name of names) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, name);
      if (descriptor?.enumerable !== true || !("value" in descriptor)) {
        return undefined;
      }
      Object.defineProperty(snapshot, name, {
        enumerable: true,
        value: descriptor.value,
      });
    }
    return Object.freeze(snapshot);
  } catch {
    return undefined;
  }
}

function normalizeDriverIssue(value: unknown): DriverStepIssue | undefined {
  try {
    const record = snapshotClosedData(value, ["code", "message"], ["actual", "expected"]);
    if (record === undefined) {
      return undefined;
    }
    const code = record.code;
    const message = record.message;
    if (
      typeof code !== "string" ||
      code.length === 0 ||
      code.length > MAX_DRIVER_CODE_LENGTH ||
      typeof message !== "string" ||
      message.length === 0 ||
      message.length > MAX_DRIVER_MESSAGE_LENGTH
    ) {
      return undefined;
    }
    const hasExpected = Object.hasOwn(record, "expected");
    const hasActual = Object.hasOwn(record, "actual");
    const expected = record.expected;
    const actual = record.actual;
    if ((hasExpected && !isObservedValue(expected)) || (hasActual && !isObservedValue(actual))) {
      return undefined;
    }

    return Object.freeze({
      ...(hasActual ? { actual: actual as DriverObservedValue } : {}),
      code,
      ...(hasExpected ? { expected: expected as DriverObservedValue } : {}),
      message,
    });
  } catch {
    return undefined;
  }
}

function normalizeDriverResult(
  value: unknown,
): { ok: true } | { issue: DriverStepIssue; ok: false } | undefined {
  try {
    const record = snapshotClosedData(value, ["ok"], ["issue"]);
    if (record === undefined) {
      return undefined;
    }
    if (record.ok === true) {
      if (Object.hasOwn(record, "issue")) {
        return undefined;
      }
      return Object.freeze({ ok: true });
    }
    if (record.ok === false) {
      if (!Object.hasOwn(record, "issue")) {
        return undefined;
      }
      const issue = normalizeDriverIssue(record.issue);
      return issue === undefined ? undefined : Object.freeze({ issue, ok: false });
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function infraResult(
  completedSteps: number,
  totalSteps: number,
  error: InterpreterError,
  flow?: string,
): InterpreterRunResult {
  return freezeTree({
    completedSteps,
    error,
    executionVerdict: EXECUTION_VERDICTS.infraError,
    ...(flow === undefined ? {} : { flow }),
    totalSteps,
  });
}

function scopedError(
  code: InterpreterError["code"],
  message: string,
  step: ContractStep,
  stepIndex: number,
): InterpreterError {
  return { code, message, step, stepIndex };
}

export async function runContract(
  contract: unknown,
  driver: InterpreterDriver,
  options: RunContractOptions = {},
): Promise<InterpreterRunResult> {
  const validated = validateContract(contract);
  if (!validated.ok) {
    return infraResult(0, 0, {
      code: INTERPRETER_ERROR_CODES.invalidContract,
      contractIssues: validated.issues,
      message: "Contract failed validation before replay.",
    });
  }

  const frozenContract = freezeTree(validated.value);
  const totalSteps = frozenContract.steps.length;
  const policy = normalizePolicy(options.policy);
  if (policy === undefined) {
    return infraResult(
      0,
      totalSteps,
      {
        code: INTERPRETER_ERROR_CODES.invalidPolicy,
        message: "Interpreter timeout policy is outside the trusted bounds.",
      },
      frozenContract.flow,
    );
  }

  const cancellation = cancellationOutcome(options.signal);
  if (isAborted(options.signal)) {
    cancellation.dispose();
    return infraResult(
      0,
      totalSteps,
      {
        code: INTERPRETER_ERROR_CODES.cancelled,
        message: "Replay was cancelled before the first step.",
      },
      frozenContract.flow,
    );
  }
  const totalTimeout = timeoutOutcome(policy.totalTimeoutMs, "total-timeout");

  try {
    for (let stepIndex = 0; stepIndex < totalSteps; stepIndex += 1) {
      const step = frozenContract.steps[stepIndex];
      if (step === undefined) {
        return infraResult(
          stepIndex,
          totalSteps,
          {
            code: INTERPRETER_ERROR_CODES.driverProtocolError,
            message: "Validated contract step was unexpectedly unavailable.",
          },
          frozenContract.flow,
        );
      }
      if (isAborted(options.signal)) {
        return infraResult(
          stepIndex,
          totalSteps,
          scopedError(
            INTERPRETER_ERROR_CODES.cancelled,
            "Replay was cancelled before step execution.",
            step,
            stepIndex,
          ),
          frozenContract.flow,
        );
      }
      if (isAborted(totalTimeout.signal)) {
        return infraResult(
          stepIndex,
          totalSteps,
          scopedError(
            INTERPRETER_ERROR_CODES.totalTimeout,
            `Replay exceeded the ${policy.totalTimeoutMs} ms total timeout.`,
            step,
            stepIndex,
          ),
          frozenContract.flow,
        );
      }

      const stepTimeout = timeoutOutcome(policy.stepTimeoutMs, "step-timeout");
      const signals = [stepTimeout.signal, totalTimeout.signal, cancellation.signal].filter(
        (signal): signal is AbortSignal => signal !== undefined,
      );
      const context = Object.freeze({
        signal: AbortSignal.any(signals),
        stepIndex,
      });
      const driverOutcome: Promise<RaceOutcome> = dispatchStep(driver, step, context).then(
        (value) => ({ kind: "driver-result", value }),
        (error: unknown) => ({ error, kind: "driver-error" }),
      );

      const outcome = await Promise.race([
        driverOutcome,
        cancellation.promise,
        totalTimeout.promise,
        stepTimeout.promise,
      ]);
      stepTimeout.dispose();

      if (isAborted(options.signal) || outcome.kind === "cancelled") {
        return infraResult(
          stepIndex,
          totalSteps,
          scopedError(
            INTERPRETER_ERROR_CODES.cancelled,
            "Replay was cancelled during step execution.",
            step,
            stepIndex,
          ),
          frozenContract.flow,
        );
      }
      if (isAborted(totalTimeout.signal) || outcome.kind === "total-timeout") {
        return infraResult(
          stepIndex,
          totalSteps,
          scopedError(
            INTERPRETER_ERROR_CODES.totalTimeout,
            `Replay exceeded the ${policy.totalTimeoutMs} ms total timeout.`,
            step,
            stepIndex,
          ),
          frozenContract.flow,
        );
      }
      if (isAborted(stepTimeout.signal) || outcome.kind === "step-timeout") {
        return infraResult(
          stepIndex,
          totalSteps,
          scopedError(
            INTERPRETER_ERROR_CODES.stepTimeout,
            `Step ${stepIndex} exceeded the ${policy.stepTimeoutMs} ms timeout.`,
            step,
            stepIndex,
          ),
          frozenContract.flow,
        );
      }
      if (outcome.kind === "driver-error") {
        return infraResult(
          stepIndex,
          totalSteps,
          scopedError(
            INTERPRETER_ERROR_CODES.driverError,
            boundedErrorMessage(outcome.error),
            step,
            stepIndex,
          ),
          frozenContract.flow,
        );
      }

      const driverResult = normalizeDriverResult(outcome.value);
      if (driverResult === undefined) {
        return infraResult(
          stepIndex,
          totalSteps,
          scopedError(
            INTERPRETER_ERROR_CODES.driverProtocolError,
            "Driver returned a malformed step result.",
            step,
            stepIndex,
          ),
          frozenContract.flow,
        );
      }
      if (!driverResult.ok) {
        return freezeTree({
          completedSteps: stepIndex,
          executionVerdict: EXECUTION_VERDICTS.regression,
          failure: {
            ...driverResult.issue,
            step,
            stepIndex,
          },
          flow: frozenContract.flow,
          totalSteps,
        });
      }
    }

    return freezeTree({
      completedSteps: totalSteps,
      executionVerdict: EXECUTION_VERDICTS.pass,
      flow: frozenContract.flow,
      totalSteps,
    });
  } finally {
    cancellation.dispose();
    totalTimeout.dispose();
  }
}
