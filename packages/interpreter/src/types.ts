import type { ContractStep, ContractValidationIssue, Locator } from "@mergevow/contract";

export const EXECUTION_VERDICTS = {
  flaky: "FLAKY",
  infraError: "INFRA_ERROR",
  pass: "PASS",
  regression: "REGRESSION",
} as const;

export type ExecutionVerdict = (typeof EXECUTION_VERDICTS)[keyof typeof EXECUTION_VERDICTS];

export const INTERPRETER_ERROR_CODES = {
  cancelled: "CANCELLED",
  driverError: "DRIVER_ERROR",
  driverProtocolError: "DRIVER_PROTOCOL_ERROR",
  invalidContract: "INVALID_CONTRACT",
  invalidPolicy: "INVALID_POLICY",
  stepTimeout: "STEP_TIMEOUT",
  totalTimeout: "TOTAL_TIMEOUT",
} as const;

export type InterpreterErrorCode =
  (typeof INTERPRETER_ERROR_CODES)[keyof typeof INTERPRETER_ERROR_CODES];

export const INTERPRETER_POLICY_LIMITS = Object.freeze({
  maxStepTimeoutMs: 60_000,
  maxTotalTimeoutMs: 600_000,
  minTimeoutMs: 1,
});

export const DEFAULT_INTERPRETER_POLICY = Object.freeze({
  stepTimeoutMs: 10_000,
  totalTimeoutMs: 120_000,
});

export interface InterpreterPolicy {
  readonly stepTimeoutMs: number;
  readonly totalTimeoutMs: number;
}

export interface RunContractOptions {
  readonly policy?: InterpreterPolicy;
  readonly signal?: AbortSignal;
}

export type DriverObservedValue = boolean | number | string | null;

export interface DriverStepIssue {
  readonly actual?: DriverObservedValue;
  readonly code: string;
  readonly expected?: DriverObservedValue;
  readonly message: string;
}

export type DriverStepResult =
  | {
      readonly ok: true;
    }
  | {
      readonly issue: DriverStepIssue;
      readonly ok: false;
    };

export interface StepExecutionContext {
  readonly signal: AbortSignal;
  readonly stepIndex: number;
}

export interface InterpreterDriver {
  assertChecked(
    locator: Locator,
    equals: boolean,
    context: StepExecutionContext,
  ): Promise<DriverStepResult>;
  assertCount(
    locator: Locator,
    equals: number,
    context: StepExecutionContext,
  ): Promise<DriverStepResult>;
  assertDisabled(
    locator: Locator,
    equals: boolean,
    context: StepExecutionContext,
  ): Promise<DriverStepResult>;
  assertHidden(locator: Locator, context: StepExecutionContext): Promise<DriverStepResult>;
  assertText(
    locator: Locator,
    equals: string,
    context: StepExecutionContext,
  ): Promise<DriverStepResult>;
  assertUrl(path: string, context: StepExecutionContext): Promise<DriverStepResult>;
  assertValue(
    locator: Locator,
    equals: string,
    context: StepExecutionContext,
  ): Promise<DriverStepResult>;
  assertVisible(locator: Locator, context: StepExecutionContext): Promise<DriverStepResult>;
  check(locator: Locator, context: StepExecutionContext): Promise<DriverStepResult>;
  click(locator: Locator, context: StepExecutionContext): Promise<DriverStepResult>;
  fill(locator: Locator, value: string, context: StepExecutionContext): Promise<DriverStepResult>;
  reload(context: StepExecutionContext): Promise<DriverStepResult>;
  select(locator: Locator, value: string, context: StepExecutionContext): Promise<DriverStepResult>;
  visit(path: string, context: StepExecutionContext): Promise<DriverStepResult>;
}

export interface StepFailure extends DriverStepIssue {
  readonly step: ContractStep;
  readonly stepIndex: number;
}

export interface InterpreterError {
  readonly code: InterpreterErrorCode;
  readonly contractIssues?: readonly ContractValidationIssue[];
  readonly message: string;
  readonly step?: ContractStep;
  readonly stepIndex?: number;
}

interface RunResultBase {
  readonly completedSteps: number;
  readonly flow?: string;
  readonly totalSteps: number;
}

export interface PassedRunResult extends RunResultBase {
  readonly executionVerdict: typeof EXECUTION_VERDICTS.pass;
  readonly flow: string;
}

export interface RegressionRunResult extends RunResultBase {
  readonly executionVerdict: typeof EXECUTION_VERDICTS.regression;
  readonly failure: StepFailure;
  readonly flow: string;
}

export interface InfraErrorRunResult extends RunResultBase {
  readonly error: InterpreterError;
  readonly executionVerdict: typeof EXECUTION_VERDICTS.infraError;
}

export type InterpreterRunResult = PassedRunResult | RegressionRunResult | InfraErrorRunResult;
